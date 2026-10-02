import type { Device, ProjectAdmin, ProjectPublic } from '../../shared/types.ts';
import { checkPreviewKey, isAdmin, issueAdminToken, previewKeyFor } from './auth.ts';
import { randomId, safeEqual } from './crypto.ts';
import { verifyGoogleIdToken } from './google.ts';
import type { Core, Project, ProxyTarget } from './types.ts';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** Share tokens are 144 random bits: unguessable, and they carry nothing about the site. */
const newShareToken = () => randomId(18);

const now = () => new Date().toISOString();
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDevice = (v: unknown): v is Device => v === 'desktop' || v === 'mobile';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Normalises what the admin typed and follows redirects so the proxy targets the final origin. */
async function resolveTarget(input: unknown) {
  let s = str(input, 2000);
  if (!s) throw new HttpError(400, 'Add the website link for this prototype');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new HttpError(400, 'That website link doesn’t look valid');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Use an http or https link');

  let final = url;
  let reachable = false;
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': UA } });
    final = new URL(r.url);
    reachable = r.ok;
    await r.body?.cancel();
  } catch {
    // Site may be down right now; keep the link as typed.
  }
  return { url: url.toString(), targetOrigin: final.origin, startPath: final.pathname + final.search, reachable };
}

/** Share access: public link switched on, or an admin (bearer token or preview key). */
export async function shareAccess(core: Core, token: string, req: Request | null, key?: unknown) {
  const p = core.data.projects.find((x) => x.shareToken === token);
  if (!p) return null;
  if (p.shareEnabled) return p;
  if (req && (await isAdmin(core, req))) return p;
  return (await checkPreviewKey(core, token, key)) ? p : null;
}

/**
 * Preview-proxy lookup. The cookie value is `<shareToken>` or `<shareToken>~<previewKey>`
 * (admins previewing a prototype whose public link is off).
 */
export async function lookupTarget(core: Core, value: string): Promise<ProxyTarget | null> {
  const [token, key] = value.split('~');
  const p = await shareAccess(core, token, null, key);
  return p ? { targetOrigin: p.targetOrigin, startPath: p.startPath } : null;
}

/** Handles every /api/* request. */
export async function handleApi(req: Request, core: Core): Promise<Response> {
  try {
    return await route(req, core);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong' }, 500);
  }
}

async function route(req: Request, core: Core): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const method = req.method;
  const { data } = core;
  let body: Record<string, unknown> = {};
  if (method !== 'GET' && method !== 'HEAD' && (req.headers.get('content-type') ?? '').includes('json')) {
    body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  }
  const m = (re: RegExp) => re.exec(path);
  let r: RegExpExecArray | null;

  const requireAdmin = async () => {
    if (!(await isAdmin(core, req))) throw new HttpError(401, 'Admin sign-in required');
  };

  const toAdmin = async (p: Project): Promise<ProjectAdmin> => ({
    ...p,
    lockDevice: !!p.lockDevice,
    previewKey: await previewKeyFor(core, p.shareToken),
  });
  const toPublic = (p: Project): ProjectPublic => ({ name: p.name, device: p.device, lockDevice: !!p.lockDevice });
  const findProject = (id: string) => {
    const p = data.projects.find((x) => x.id === id);
    if (!p) throw new HttpError(404, 'Prototype not found');
    return p;
  };
  const share = async (token: string) => {
    const p = await shareAccess(core, token, req, req.headers.get('x-preview-key') ?? url.searchParams.get('k'));
    if (!p) throw new HttpError(404, 'This prototype link isn’t available');
    return p;
  };

  // --- Session ---------------------------------------------------------------

  if (path === '/config') {
    return json({
      proxyOrigin: core.proxyOrigin(req),
      authRequired: !!core.adminPassword || core.requirePassword || !!core.googleClientId,
      googleClientId: core.googleClientId || undefined,
    });
  }
  if (path === '/admin/google' && method === 'POST') {
    if (!core.googleClientId) throw new HttpError(404, 'Google sign-in isn’t set up');
    const email = await verifyGoogleIdToken(str(body.credential, 4000), core.googleClientId);
    if (!email) throw new HttpError(401, 'Google sign-in didn’t go through. Try again.');
    if (!core.adminEmails.includes(email)) throw new HttpError(403, `${email} doesn’t have access to this workspace`);
    return json({ token: await issueAdminToken(core) });
  }
  if (path === '/admin/login' && method === 'POST') {
    if (core.googleClientId) throw new HttpError(403, 'Sign in with Google');
    if (!core.adminPassword && core.requirePassword) throw new HttpError(503, 'Admin password isn’t set up yet');
    const pw = str(body.password, 200);
    if (core.adminPassword && !safeEqual(pw, core.adminPassword)) throw new HttpError(401, 'That password isn’t right');
    return json({ token: await issueAdminToken(core) });
  }
  if (path === '/admin/me') {
    await requireAdmin();
    return json({ ok: true });
  }

  // --- Projects (admin only: the only responses that include the URL) ------------

  if (path === '/projects' && method === 'GET') {
    await requireAdmin();
    const list = [...data.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json(await Promise.all(list.map(toAdmin)));
  }
  if (path === '/projects' && method === 'POST') {
    await requireAdmin();
    const name = str(body.name, 120);
    if (!name) throw new HttpError(400, 'Give the prototype a name');
    const target = await resolveTarget(body.url);
    const p: Project = {
      id: randomId(6),
      name,
      url: target.url,
      targetOrigin: target.targetOrigin,
      startPath: target.startPath,
      device: isDevice(body.device) ? body.device : 'desktop',
      shareToken: newShareToken(),
      shareEnabled: true,
      lockDevice: body.lockDevice === true,
      createdAt: now(),
      updatedAt: now(),
    };
    data.projects.push(p);
    await core.persist();
    return json({ ...(await toAdmin(p)), reachable: target.reachable }, 201);
  }
  if ((r = m(/^\/projects\/([^/]+)$/))) {
    await requireAdmin();
    const p = findProject(r[1]);
    if (method === 'GET') return json(await toAdmin(p));
    if (method === 'PATCH') {
      if (body.name !== undefined) {
        const name = str(body.name, 120);
        if (!name) throw new HttpError(400, 'Give the prototype a name');
        p.name = name;
      }
      if (isDevice(body.device)) p.device = body.device;
      if (typeof body.shareEnabled === 'boolean') p.shareEnabled = body.shareEnabled;
      if (typeof body.lockDevice === 'boolean') p.lockDevice = body.lockDevice;
      let reachable: boolean | undefined;
      if (body.url !== undefined && str(body.url, 2000) !== p.url) {
        const t = await resolveTarget(body.url);
        Object.assign(p, { url: t.url, targetOrigin: t.targetOrigin, startPath: t.startPath });
        reachable = t.reachable;
      }
      p.updatedAt = now();
      await core.persist();
      return json({ ...(await toAdmin(p)), reachable });
    }
    if (method === 'DELETE') {
      data.projects.splice(data.projects.indexOf(p), 1);
      await core.persist();
      return json({ ok: true });
    }
  }
  if ((r = m(/^\/projects\/([^/]+)\/rotate-link$/)) && method === 'POST') {
    await requireAdmin();
    const p = findProject(r[1]);
    p.shareToken = newShareToken();
    p.updatedAt = now();
    await core.persist();
    return json(await toAdmin(p));
  }

  // --- Share (anyone holding the link) ---------------------------------------------

  if ((r = m(/^\/share\/([^/]+)$/))) return json(toPublic(await share(r[1])));

  if ((r = m(/^\/share\/([^/]+)\/favicon$/))) {
    const p = await share(r[1]);
    const icon = await favicon(p);
    if (!icon) throw new HttpError(404, 'No icon');
    return new Response(icon.body, { headers: { 'content-type': icon.type, 'cache-control': 'private, max-age=3600' } });
  }

  throw new HttpError(404, 'Not found');
}

// --- Favicon (fetched server-side so the site's host never reaches the browser) ---

const iconCache = new Map<string, { at: number; icon: { type: string; body: ArrayBuffer } | null }>();

async function favicon(p: Project) {
  const key = p.targetOrigin + p.startPath;
  const hit = iconCache.get(key);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.icon;

  let icon: { type: string; body: ArrayBuffer } | null = null;
  try {
    const home = await fetch(key, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA } });
    const html = (await home.text()).slice(0, 200_000);
    const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /rel=["']?[^"'>]*icon/i.test(t));
    const pick = tags.find((t) => /apple-touch-icon/i.test(t)) ?? tags.find((t) => /\.(png|svg)/i.test(t)) ?? tags[0];
    const href = pick && /href=["']([^"']+)["']/i.exec(pick)?.[1];
    const candidates = [href ? new URL(href, home.url) : null, new URL('/favicon.ico', p.targetOrigin)];
    for (const u of candidates) {
      if (!u) continue;
      const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA } });
      const type = r.headers.get('content-type') ?? '';
      if (r.ok && type.startsWith('image/')) {
        icon = { type, body: await r.arrayBuffer() };
        break;
      }
    }
  } catch {
    // leave icon null
  }
  iconCache.set(key, { at: Date.now(), icon });
  return icon;
}
