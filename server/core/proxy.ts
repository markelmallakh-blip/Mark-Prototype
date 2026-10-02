import type { ProxyTarget } from './types.ts';

/**
 * Masked preview origin.
 *
 * The prototype iframe never points at the real website. It loads this origin, which forwards
 * every request to the project's target and rewrites references to the target host, so viewers
 * only ever see the preview host. A cookie (set by /__pt/start from the share token) says which
 * project a request belongs to; paths are passed through 1:1 so client-side routers keep working.
 * Every HTML page gets the bridge (bridge.js) injected, so sites need no code changes.
 *
 * Pages only render inside the prototype's iframe: opening the preview host as a normal tab
 * (copying the frame address, "open in new tab") shows a notice instead of the site.
 */

export interface ProxyEnv {
  /** Resolves a cookie value (`token` or `token~previewKey`) to a target, or null when not allowed. */
  lookup(value: string): Promise<ProxyTarget | null>;
  /** Source of server/bridge.js. */
  bridge(): string;
  /** Public origin of the preview host, when the request URL doesn't carry it (local `wrangler dev`). */
  origin?: string;
}

const COOKIE = '__pt';

const DROP_REQUEST = new Set([
  'host', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer',
  'content-length', 'accept-encoding', 'cookie', 'origin', 'referer', 'if-none-match', 'if-modified-since',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'forwarded',
  'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry', 'cf-worker', 'cdn-loop', 'true-client-ip',
]);

const DROP_RESPONSE = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'x-frame-options',
  'content-security-policy', 'content-security-policy-report-only', 'strict-transport-security',
  'cross-origin-embedder-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'set-cookie',
  'location', 'etag', 'last-modified', 'alt-svc', 'report-to', 'reporting-endpoints', 'nel', 'link', 'refresh',
]);

const TEXT_TYPES = /text\/html|text\/css|javascript|ecmascript|json|text\/x-component|xml/;

function parseCookies(header: string | null) {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const bareHost = (host: string) => host.replace(/^www\./i, '').toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const rewriteCache = new Map<string, RegExp>();
function hostPattern(targetOrigin: string) {
  let re = rewriteCache.get(targetOrigin);
  if (!re) {
    const host = escapeRe(bareHost(new URL(targetOrigin).host));
    // https://host, //host, and JSON-escaped https:\/\/host — with or without www.
    re = new RegExp(String.raw`(?:https?:)?(\/\/|\\\/\\\/)(?:www\.)?${host}(?![\w-]|\.[\w-])`, 'gi');
    rewriteCache.set(targetOrigin, re);
  }
  return re;
}

function rewriteText(text: string, targetOrigin: string, proxyOrigin: string) {
  // Cheap check first: most bundles never mention their own origin.
  if (!text.toLowerCase().includes(bareHost(new URL(targetOrigin).host))) return text;
  const escaped = proxyOrigin.replace(/\//g, '\\/');
  return text.replace(hostPattern(targetOrigin), (_m, slashes: string) => (slashes === '//' ? proxyOrigin : escaped));
}

function rewriteLocation(location: string, targetOrigin: string, proxyOrigin: string) {
  try {
    const u = new URL(location, targetOrigin);
    if (bareHost(u.host) !== bareHost(new URL(targetOrigin).host)) return location;
    return proxyOrigin + u.pathname + u.search + u.hash;
  } catch {
    return location;
  }
}

function rewriteSetCookie(cookie: string, secure: boolean) {
  let parts = cookie.split(';').map((s) => s.trim()).filter((s) => s && !/^domain=/i.test(s));
  if (!secure) {
    parts = parts
      .filter((s) => !/^(secure|partitioned)$/i.test(s))
      .map((s) => (/^samesite=none$/i.test(s) ? 'SameSite=Lax' : s));
  }
  return parts.join('; ');
}

function injectBridge(html: string, cookieValue: string, bridge: string) {
  if (!/<(!doctype|html|head|body)\b/i.test(html.slice(0, 4000))) return html; // fragment, not a page
  html = html
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/\sintegrity=("[^"]*"|'[^']*')/gi, '');
  const tag =
    `<meta name="robots" content="noindex, nofollow">` +
    // Phones and trackpad Macs use overlay scrollbars; hide the classic gutter so the viewport is true to size.
    `<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}</style>` +
    `<script>window.__PT__=${JSON.stringify({ c: cookieValue })};\n${bridge}</script>`;
  const head = /<head\b[^>]*>/i.exec(html) ?? /<html\b[^>]*>/i.exec(html);
  if (!head) return tag + html;
  const at = head.index + head[0].length;
  return html.slice(0, at) + tag + html.slice(at);
}

function messagePage(status: number, message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Preview</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#f5f5f5;
font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#525252;text-align:center">
<div style="padding:24px"><div style="font-weight:700;color:#171717;margin-bottom:4px">Preview unavailable</div>${message}</div>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );
}

export async function handleProxy(req: Request, env: ProxyEnv): Promise<Response> {
  const url = new URL(req.url);
  const proxyOrigin = env.origin ?? url.origin;
  const secure = proxyOrigin.startsWith('https:');

  // Browsers mark top-level page loads `sec-fetch-dest: document`; inside the prototype it's `iframe`.
  if (req.headers.get('sec-fetch-dest') === 'document') {
    return messagePage(403, 'This preview can only be viewed from its prototype link.');
  }

  if (url.pathname === '/__pt/start') {
    const t = url.searchParams.get('t') ?? '';
    const k = url.searchParams.get('k') ?? '';
    const value = k ? `${t}~${k}` : t;
    const target = await env.lookup(value);
    if (!target) return messagePage(404, 'This prototype link is no longer active.');
    const q = url.searchParams.get('path') ?? '';
    const to = /^\/(?!\/)/.test(q) ? q : target.startPath || '/';
    return new Response(null, {
      status: 302,
      headers: {
        location: to,
        'set-cookie': `${COOKIE}=${value}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`,
        'cache-control': 'no-store',
      },
    });
  }

  const cookieValue = parseCookies(req.headers.get('cookie'))[COOKIE];
  const target = cookieValue ? await env.lookup(cookieValue) : null;
  if (!target || !cookieValue) return messagePage(404, 'Open this preview from its prototype link.');

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!DROP_REQUEST.has(k)) headers.set(k, v);
  });
  const siteCookies = (req.headers.get('cookie') ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith(`${COOKIE}=`))
    .join('; ');
  if (siteCookies) headers.set('cookie', siteCookies);
  if (req.headers.has('origin')) headers.set('origin', target.targetOrigin);
  const referer = req.headers.get('referer');
  if (referer) headers.set('referer', referer.replace(proxyOrigin, target.targetOrigin));

  // The timeout covers waiting for the site to respond, not the body: large media can stream for minutes.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30000);
  req.signal?.addEventListener('abort', () => abort.abort());

  let upstream: Response;
  try {
    upstream = await fetch(new URL(url.pathname + url.search, target.targetOrigin), {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      redirect: 'manual',
      signal: abort.signal,
    });
  } catch {
    return messagePage(502, 'The preview is taking too long to respond. Try again in a moment.');
  } finally {
    clearTimeout(timer);
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key)) out.set(key, value);
  });
  const location = upstream.headers.get('location');
  if (location) out.set('location', rewriteLocation(location, target.targetOrigin, proxyOrigin));
  for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', rewriteSetCookie(c, secure));
  out.set('x-robots-tag', 'noindex, nofollow');

  const noBody = req.method === 'HEAD' || [101, 204, 205, 304].includes(upstream.status) || !upstream.body;
  if (noBody) return new Response(null, { status: upstream.status, headers: out });

  const type = (upstream.headers.get('content-type') ?? '').toLowerCase();
  const size = Number(upstream.headers.get('content-length') ?? 0);
  if (TEXT_TYPES.test(type) && size < 20_000_000) {
    let text: string;
    try {
      text = await upstream.text();
    } catch {
      return messagePage(502, 'The preview didn’t finish loading. Try again in a moment.');
    }
    text = rewriteText(text, target.targetOrigin, proxyOrigin);
    if (type.includes('text/html')) {
      text = injectBridge(text, cookieValue, env.bridge());
      out.set('cache-control', 'no-store');
    }
    out.set('content-type', /charset=/.test(type) ? type.replace(/charset=[^;]+/, 'charset=utf-8') : type);
    return new Response(text, { status: upstream.status, headers: out });
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
