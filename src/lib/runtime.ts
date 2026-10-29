import type { CommentThread } from '../../shared/types';

export function shareUrl(token: string) {
  return `${location.origin}/p/${token}`;
}

export function faviconUrl(p: { shareToken: string; previewKey: string }) {
  return `/api/share/${p.shareToken}/favicon?k=${p.previewKey}`;
}

/** iframe src for a prototype: always the masked preview origin, optionally reopening a specific page. */
export function previewSrc(o: { proxyOrigin: string; token: string; previewKey?: string; path?: string }) {
  return `${o.proxyOrigin}/__pt/start?t=${encodeURIComponent(o.token)}${o.previewKey ? `&k=${o.previewKey}` : ''}${
    o.path ? `&path=${encodeURIComponent(o.path)}` : ''
  }`;
}

/** Live comment list for a prototype. Returns an unsubscribe function. */
export function subscribeComments(token: string, previewKey: string | undefined, onChange: (list: CommentThread[]) => void) {
  const es = new EventSource(`/api/share/${token}/stream${previewKey ? `?k=${previewKey}` : ''}`);
  es.addEventListener('comments', (e) => onChange(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}
