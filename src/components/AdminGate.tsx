import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import type { AppConfig } from '../../shared/types';
import { api, adminToken } from '../lib/api';
import { useConfig } from '../lib/config';
import { Button, Input, Spinner } from './ui';

/**
 * Admin-only area: ADMIN_PASSWORD sign-in (or no password in local dev).
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
  if (status === 'out') return <SignIn onDone={() => setStatus('in')} />;
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
