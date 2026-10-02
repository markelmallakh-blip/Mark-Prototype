// Verifies "Sign in with Google" ID tokens (RS256 JWTs) with Web Crypto: same code in Node and Workers.

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let certs: { at: number; keys: Map<string, CryptoKey> } | null = null;

async function googleKeys() {
  if (certs && Date.now() - certs.at < 60 * 60 * 1000) return certs.keys;
  const r = await fetch(CERTS_URL, { signal: AbortSignal.timeout(8000) });
  const { keys } = (await r.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const map = new Map<string, CryptoKey>();
  for (const k of keys) {
    map.set(k.kid, await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  certs = { at: Date.now(), keys: map };
  return map;
}

function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Returns the verified, lower-cased email, or null when the token isn't a valid Google sign-in for `clientId`. */
export async function verifyGoogleIdToken(token: string, clientId: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (header.alg !== 'RS256') return null;
    let key = (await googleKeys()).get(header.kid);
    if (!key) {
      certs = null; // Google rotated its keys
      key = (await googleKeys()).get(header.kid);
    }
    if (!key) return null;
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    if (!ISSUERS.includes(payload.iss) || payload.aud !== clientId) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (payload.email_verified !== true || typeof payload.email !== 'string') return null;
    return payload.email.toLowerCase();
  } catch {
    return null;
  }
}
