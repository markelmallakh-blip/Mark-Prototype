import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Laptop, Link2, Lock, MessageCircle, Plus, Smartphone } from 'lucide-react';
import type { ProjectAdmin } from '../../shared/types';
import { NewPrototypeDialog } from '../components/NewPrototypeDialog';
import { Button, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { cn, timeAgo } from '../lib/format';
import { faviconUrl, shareUrl } from '../lib/runtime';

export function PrototypesPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectAdmin[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<ProjectAdmin[]>('/projects').then(setProjects, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prototypes</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Share a live website as a prototype. Clients see it inside a MacBook or mobile mockup and leave comments on the page. The real link stays hidden.
          </p>
        </div>
        {projects && projects.length > 0 && (
          <Button variant="brand" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New prototype
          </Button>
        )}
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!projects && !error && (
        <div className="grid place-items-center py-24 text-muted-foreground"><Spinner /></div>
      )}
      {projects?.length === 0 && <EmptyState onCreate={() => setCreating(true)} />}
      {projects && projects.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <button
              onClick={() => setCreating(true)}
              className="group flex h-full min-h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-muted-foreground transition-colors hover:border-brand hover:bg-brand/5 hover:text-foreground"
            >
              <span className="grid size-11 place-items-center rounded-full bg-muted transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                <Plus className="size-5" />
              </span>
              <span className="text-sm font-semibold">New prototype</span>
            </button>
          </li>
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} onOpen={() => navigate(`/prototype/${p.id}`)} />
            </li>
          ))}
        </ul>
      )}

      <NewPrototypeDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          setCreating(false);
          navigate(`/prototype/${p.id}`);
        }}
      />
    </div>
  );
}

function ProjectCard({ project: p, onOpen }: { project: ProjectAdmin; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);
  const Icon = p.device === 'desktop' ? Laptop : Smartphone;
  const host = (() => {
    try {
      return new URL(p.url).host;
    } catch {
      return p.url;
    }
  })();

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(shareUrl(p.shareToken));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      <div className="relative grid h-36 place-items-center overflow-hidden bg-spaceGrey">
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
        <DeviceGlyph project={p} />
        {!p.shareEnabled && (
          <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white/80">Link off</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{p.name}</h3>
          <p className="truncate text-xs text-muted-foreground" title="Visible to admins only">{host}</p>
        </div>
        <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1" title={p.lockDevice ? 'Viewers only see this device' : undefined}>
            <Icon className="size-3.5" /> {p.device === 'desktop' ? 'MacBook' : 'Mobile'}
            {p.lockDevice && <Lock className="size-3" aria-label="Only this device" />}
          </span>
          <span className={cn('inline-flex items-center gap-1', p.openComments > 0 && 'font-semibold text-foreground')}>
            <MessageCircle className="size-3.5" /> {p.openComments} open
          </span>
          <span className="ml-auto">{timeAgo(p.updatedAt)}</span>
          <button
            onClick={copy}
            disabled={!p.shareEnabled}
            aria-label="Copy share link"
            title={p.shareEnabled ? 'Copy share link' : 'Share link is off'}
            className="-my-1 grid size-7 place-items-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Link2 className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceGlyph({ project }: { project: ProjectAdmin }) {
  const { device } = project;
  const [iconOk, setIconOk] = useState(true);
  const icon = iconOk && (
    <img
      src={faviconUrl(project)}
      alt=""
      onError={() => setIconOk(false)}
      className="size-8 rounded-md object-contain"
    />
  );
  if (device === 'mobile') {
    return (
      <div className="relative h-28 w-14 translate-y-5 rounded-[14px] border-[3px] border-[#0b0b0c] bg-white/95 shadow-2xl ring-1 ring-white/20 transition-transform duration-300 group-hover:translate-y-3">
        <div className="absolute left-1/2 top-1 h-1.5 w-5 -translate-x-1/2 rounded-full bg-black" />
        <div className="grid h-full place-items-center">{icon}</div>
      </div>
    );
  }
  return (
    <div className="relative translate-y-5 transition-transform duration-300 group-hover:translate-y-3">
      <div className="h-24 w-40 rounded-t-lg border-[3px] border-b-[5px] border-[#0b0b0c] bg-white/95 shadow-2xl ring-1 ring-white/20">
        <div className="grid h-full place-items-center">{icon}</div>
      </div>
      <div className="mx-auto h-2 w-48 -translate-x-4 rounded-b-md bg-gradient-to-b from-[#d4d5d8] to-[#8d8f94]" />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-20 text-center">
      <div className="mb-4 flex items-end gap-2 text-muted-foreground">
        <Laptop className="size-9" />
        <Smartphone className="size-6" />
      </div>
      <h2 className="font-semibold">No prototypes yet</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Add a website link, pick MacBook or mobile, and share a link your client can comment on.
      </p>
      <Button variant="brand" className="mt-5" onClick={onCreate}>
        <Plus className="size-4" /> New prototype
      </Button>
    </div>
  );
}
