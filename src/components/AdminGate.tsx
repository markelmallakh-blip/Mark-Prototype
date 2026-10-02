import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import type { AppConfig } from '../../shared/types';
import { api, adminToken } from '../lib/api';
import { useConfig } from '../lib/config';
import { BrandMark } from './BrandMark';
import { Button, Input, Spinner } from './ui';

/**
 * Admin-only area: Sign in with Google (allowed emails only), or ADMIN_PASSWORD when Google isn't set up
 * (no sign-in at all in local dev).
 */
export function AdminGate({ children }: { children: (config: AppConfig) => ReactNode }) {
  const { config, error } = useConfig();
  const [status, setStatus] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    (async () => {
      if (adminToken.get()) {
        try {
          await api('/admin/me');
          if (!cancelled) setStatus('in');
          return;
        } catch {
          adminToken.clear();
        }
      }
      if (!config.authRequired) {
        const { token } = await api<{ token: string }>('/admin/login', { method: 'POST', body: {} });
        adminToken.set(token);
        if (!cancelled) setStatus('in');
      } else if (!cancelled) setStatus('out');
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  if (error) return <Centered>Couldn’t reach the server. {error}</Centered>;
  if (!config || status === 'checking') return <Centered><Spinner className="text-muted-foreground" /></Centered>;
  if (status === 'out') {
    return config.googleClientId ? (
      <GoogleSignIn clientId={config.googleClientId} onDone={() => setStatus('in')} />
    ) : (
      <SignIn onDone={() => setStatus('in')} />
    );
  }
  return <>{children(config)}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">{children}</div>;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>('/admin/login', { method: 'POST', body: { password } });
      adminToken.set(token);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid h-full place-items-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold"><Lock className="size-4" /> Team sign-in</div>
        <Input type="password" autoComplete="current-password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <Button variant="brand" className="mt-4 w-full" disabled={busy || !password}>{busy ? <Spinner /> : 'Sign in'}</Button>
      </form>
    </div>
  );
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }): void;
          renderButton(el: HTMLElement, o: Record<string, unknown>): void;
        };
      };
    };
  }
}

let gsi: Promise<void> | null = null;
function loadGsi() {
  gsi ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gsi = null;
      reject(new Error('Couldn’t load Google sign-in. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return gsi;
}

function GoogleSignIn({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGsi().then(
      () => {
        if (cancelled || !buttonRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setBusy(true);
            setError('');
            try {
              const { token } = await api<{ token: string }>('/admin/google', { method: 'POST', body: { credential } });
              adminToken.set(token);
              onDone();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
      },
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [clientId, onDone]);

  return (
    <div className="grid h-full place-items-center bg-spaceGrey p-6">
      <div className="flex w-full max-w-sm flex-col items-center rounded-2xl bg-card p-8 text-center shadow-2xl">
        <BrandMark className="size-11 text-lg" />
        <h1 className="mt-5 text-lg font-bold tracking-tight">Prototype</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in with your Google account to manage prototypes.</p>
        <div className="mt-6 flex min-h-11 items-center justify-center">
          {/* The Google button stays mounted (rendered once) so it's still there after a failed attempt. */}
          <div ref={buttonRef} className={busy ? 'hidden' : undefined} />
          {busy && <Spinner className="text-muted-foreground" />}
        </div>
        {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
