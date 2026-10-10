import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, EyeOff, Link2, RefreshCw, Settings, Trash2 } from 'lucide-react';
import type { AppConfig, Device, ProjectAdmin } from '../../shared/types';
import { DeviceLock, DevicePicker } from '../components/DevicePicker';
import { IconButton, Presenter } from '../components/presenter/Presenter';
import { Button, Field, Input, Spinner, Switch } from '../components/ui';
import { api } from '../lib/api';
import { cn } from '../lib/format';
import { shareUrl } from '../lib/runtime';

export function AdminPresenterPage({ config }: { config: AppConfig }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectAdmin | null>(null);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'share' | 'settings' | null>(null);

  useEffect(() => {
    api<ProjectAdmin>(`/projects/${id}`).then(setProject, (e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (project) document.title = `${project.name} — Prototype`;
  }, [project]);

  if (error) {
    return (
      <div className="grid h-full place-items-center bg-stage p-6 text-center text-sm text-white/60">
        <div>
          <p>{error}</p>
          <Link to="/prototype" className="mt-3 inline-block font-semibold text-brand hover:underline">Back to prototypes</Link>
        </div>
      </div>
    );
  }
  if (!project) return <div className="grid h-full place-items-center bg-stage text-white/50"><Spinner /></div>;

  const update = async (patch: Partial<ProjectAdmin>) => {
    const next = await api<ProjectAdmin>(`/projects/${project.id}`, { method: 'PATCH', body: patch });
    setProject(next);
    return next;
  };

  return (
    <div className="relative h-full">
      <Presenter
        // Remount when the share token or target changes so the preview reloads.
        key={`${project.shareToken}|${project.url}|${project.device}|${project.lockDevice}`}
        token={project.shareToken}
        previewKey={project.previewKey}
        proxyOrigin={config.proxyOrigin}
        isAdmin
        name={project.name}
        defaultDevice={project.device}
        lockedDevice={project.lockDevice ? project.device : undefined}
        left={
          <>
            <Link to="/prototype" aria-label="Back to prototypes" className="grid size-9 flex-none place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
              <ArrowLeft className="size-[18px]" />
            </Link>
            <span className="truncate text-sm font-semibold">{project.name}</span>
          </>
        }
        right={
          <>
            <span className="mx-1 h-5 w-px bg-white/10 max-sm:hidden" />
            <IconButton label="Settings" active={panel === 'settings'} onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}>
              <Settings className="size-[18px]" />
            </IconButton>
            <button
              onClick={() => setPanel((p) => (p === 'share' ? null : 'share'))}
              className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground hover:brightness-95"
            >
              <Link2 className="size-3.5" /> Share
            </button>
          </>
        }
      />
      {panel === 'share' && <SharePopover project={project} update={update} setProject={setProject} onClose={() => setPanel(null)} />}
      {panel === 'settings' && (
        <SettingsDrawer
          project={project}
          update={update}
          onClose={() => setPanel(null)}
          onDeleted={() => navigate('/prototype')}
        />
      )}
    </div>
  );
}

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !t.closest('header')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return ref;
}

function SharePopover({ project, update, setProject, onClose }: {
  project: ProjectAdmin;
  update: (p: Partial<ProjectAdmin>) => Promise<ProjectAdmin>;
  setProject: (p: ProjectAdmin) => void;
  onClose: () => void;
}) {
  const ref = useDismiss(onClose);
  const [copied, setCopied] = useState(false);
  const link = shareUrl(project.shareToken);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function rotate() {
    if (!confirm('Create a new link? The current link will stop working for everyone who has it.')) return;
    setProject(await api<ProjectAdmin>(`/projects/${project.id}/rotate-link`, { method: 'POST' }));
  }

  return (
    <div ref={ref} className="absolute right-2 top-14 z-40 w-[360px] max-w-[calc(100vw-16px)] animate-pop-in rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl">
      <h3 className="text-sm font-bold">Share prototype</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Anyone with the link can view the prototype and leave comments.</p>

      <div className="mt-4 flex gap-2">
        <Input readOnly value={project.shareEnabled ? link : 'Link sharing is off'} onFocus={(e) => e.target.select()} className={cn('h-9 font-mono text-xs', !project.shareEnabled && 'text-muted-foreground')} />
        <Button size="sm" variant="brand" className="h-9 flex-none" onClick={copy} disabled={!project.shareEnabled}>
          {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
        </Button>
      </div>

      <div className="mt-4 space-y-3 border-t pt-4">
        <Row label="Anyone with the link can view" checked={project.shareEnabled} onChange={(v) => update({ shareEnabled: v })} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <EyeOff className="mt-0.5 size-3.5 flex-none" />
        The website address is never sent to viewers. The link holds only a random key, and the site loads through a masked preview that won’t open outside the prototype.
      </div>
      <button onClick={rotate} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <RefreshCw className="size-3.5" /> Reset link
      </button>
    </div>
  );
}

function Row({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function SettingsDrawer({ project, update, onClose, onDeleted }: {
  project: ProjectAdmin;
  update: (p: Partial<ProjectAdmin>) => Promise<ProjectAdmin & { reachable?: boolean }>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const ref = useDismiss(onClose);
  const [name, setName] = useState(project.name);
  const [url, setUrl] = useState(project.url);
  const [device, setDevice] = useState<Device>(project.device);
  const [lockDevice, setLockDevice] = useState(project.lockDevice);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const dirty =
    name !== project.name || url !== project.url || device !== project.device || lockDevice !== project.lockDevice;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const next = await update({ name, url, device, lockDevice });
      setUrl(next.url);
      setMsg(
        next.reachable === false
          ? { tone: 'warn', text: 'Saved, but the site didn’t respond. Check that the link is live.' }
          : { tone: 'ok', text: 'Saved' },
      );
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete “${project.name}” and all its comments? This can’t be undone.`)) return;
    await api(`/projects/${project.id}`, { method: 'DELETE' });
    onDeleted();
  }

  return (
    <div ref={ref} className="absolute inset-y-0 right-0 top-12 z-40 flex w-[380px] max-w-full animate-slide-in flex-col border-l bg-card text-card-foreground shadow-2xl">
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div>
          <h3 className="text-base font-bold">Settings</h3>
          <p className="text-xs text-muted-foreground">Only admins can see this panel.</p>
        </div>
        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Website link" hint="Hidden from viewers. Change it any time: the share link stays the same.">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoCapitalize="off" className="font-mono text-xs" />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Device</span>
          <DevicePicker value={device} onChange={setDevice} />
          <DeviceLock device={device} checked={lockDevice} onChange={setLockDevice} />
        </div>
        {msg && (
          <p className={cn('rounded-lg px-3 py-2 text-xs', msg.tone === 'ok' && 'bg-emerald-500/10 text-emerald-600', msg.tone === 'warn' && 'bg-amber-500/10 text-amber-600', msg.tone === 'error' && 'bg-destructive/10 text-destructive')}>
            {msg.text}
          </p>
        )}
        <div className="border-t pt-5">
          <h4 className="text-[13px] font-semibold">Delete prototype</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">Removes the share link and every comment.</p>
          <Button variant="outline" size="sm" className="mt-3 text-destructive" onClick={remove}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t p-4">
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        <Button variant="brand" size="sm" onClick={save} disabled={!dirty || busy || !name.trim() || !url.trim()}>
          {busy ? <Spinner /> : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
