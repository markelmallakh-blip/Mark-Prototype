import type { CommentThread } from '../../shared/types';

/**
 * Where the API lives. Empty in local dev (Vite proxies /api). On GitHub Pages the app is static,
 * so it calls the Cloudflare worker (API + masked preview) set at build time.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');

/** GitHub Pages can't rewrite deep links to index.html, so Pages builds use #/ routes. */
export const HASH_ROUTES = import.meta.env.VITE_HASH_ROUTES === '1';

const BASE = import.meta.env.BASE_URL;

export function shareUrl(token: string) {
  return HASH_ROUTES ? `${location.origin}${BASE}#/p/${token}` : `${location.origin}/p/${token}`;
}

export function faviconUrl(p: { shareToken: string; previewKey: string }) {
  return `${API_ORIGIN}/api/share/${p.shareToken}/favicon?k=${p.previewKey}`;
}

/** iframe src for a prototype: always the masked preview origin, optionally reopening a specific page. */
export function previewSrc(o: { proxyOrigin: string; token: string; previewKey?: string; path?: string }) {
  return `${o.proxyOrigin}/__pt/start?t=${encodeURIComponent(o.token)}${o.previewKey ? `&k=${o.previewKey}` : ''}${
    o.path ? `&path=${encodeURIComponent(o.path)}` : ''
  }`;
}

/** Live comment list for a prototype. Returns an unsubscribe function. */
export function subscribeComments(token: string, previewKey: string | undefined, onChange: (list: CommentThread[]) => void) {
  const es = new EventSource(`${API_ORIGIN}/api/share/${token}/stream${previewKey ? `?k=${previewKey}` : ''}`);
  es.addEventListener('comments', (e) => onChange(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}
