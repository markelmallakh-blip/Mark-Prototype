// Web Crypto helpers: the same code runs in Node (local dev) and on Cloudflare Workers.

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const randomId = (bytes = 9) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256Hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

const keys = new Map<string, Promise<CryptoKey>>();
export async function hmac(secret: string, message: string) {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keys.set(secret, key);
  }
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await key, enc.encode(message))));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
