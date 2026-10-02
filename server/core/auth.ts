import { hmac, safeEqual } from './crypto.ts';
import type { Core } from './types.ts';

const DAY = 24 * 60 * 60 * 1000;

export async function issueAdminToken(core: Core) {
  const body = `adm.${Date.now() + 30 * DAY}`;
  return `${body}.${await hmac(core.secret, body)}`;
}

export async function isAdmin(core: Core, req: Request) {
  const h = req.headers.get('authorization');
  const token = h?.startsWith('Bearer ') ? h.slice(7) : '';
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const body = token.slice(0, i);
  if (!safeEqual(token.slice(i + 1), await hmac(core.secret, body))) return false;
  return Number(body.split('.')[1]) > Date.now();
}

/** Lets admins open a prototype whose public link is switched off. */
export async function previewKeyFor(core: Core, shareToken: string) {
  return (await hmac(core.secret, `preview:${shareToken}`)).slice(0, 22);
}

export async function checkPreviewKey(core: Core, shareToken: string, key: unknown) {
  return typeof key === 'string' && key.length > 0 && safeEqual(key, await previewKeyFor(core, shareToken));
}
