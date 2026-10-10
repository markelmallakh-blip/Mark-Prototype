import { useCallback, useState } from 'react';

/** Who is commenting. `id` is public; `secret` proves authorship for deletes and never leaves this browser except to the API. */
export interface Identity {
  id: string;
  secret: string;
  name: string;
}

const KEY = 'pt_identity';

function random(bytes: number) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function load(): Identity {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v?.id && v?.secret) return { id: v.id, secret: v.secret, name: v.name ?? '' };
  } catch {
    // fall through
  }
  const fresh = { id: random(8), secret: random(24), name: '' };
  save(fresh);
  return fresh;
}

function save(i: Identity) {
  try {
    localStorage.setItem(KEY, JSON.stringify(i));
  } catch {
    // storage unavailable — identity lasts for this page view
  }
}

export function useIdentity() {
  const [identity, setIdentity] = useState(load);
  const setName = useCallback((name: string) => {
    setIdentity((prev) => {
      const next = { ...prev, name };
      save(next);
      return next;
    });
  }, []);
  return { identity, setName };
}

export type Viewer = ReturnType<typeof useIdentity>;
