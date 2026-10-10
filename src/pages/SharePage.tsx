import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Laptop, Smartphone } from 'lucide-react';
import type { ProjectPublic } from '../../shared/types';
import { BrandMark } from '../components/BrandMark';
import { Avatar } from '../components/presenter/Comments';
import { Presenter } from '../components/presenter/Presenter';
import { Dialog, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useConfig } from '../lib/config';
import { useIdentity } from '../lib/identity';

/** What the client opens: device mockup and comments, with no website address anywhere. */
export function SharePage() {
  const { token = '' } = useParams();
  const { config, error: configError } = useConfig();
  const viewer = useIdentity();
  const [project, setProject] = useState<ProjectPublic | null>(null);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    api<ProjectPublic>(`/share/${token}`).then(setProject, (e: Error) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (project) document.title = project.name;
  }, [project]);

  if (error || configError) {
    return (
      <div className="grid h-full place-items-center bg-stage p-6 text-center">
        <div>
          <BrandMark className="mx-auto mb-4 size-11 text-lg" />
          <p className="font-semibold text-white">This prototype isn’t available</p>
          <p className="mt-1 text-sm text-white/50">The link may have been reset or switched off. Ask the person who shared it for a new one.</p>
        </div>
      </div>
    );
  }
  if (!project || !config) return <div className="grid h-full place-items-center bg-stage text-white/50"><Spinner /></div>;

  // Everyone with the link introduces themselves once; the name is reused for every comment.
  if (!viewer.identity.name) return <Welcome project={project} onEnter={viewer.setName} />;

  return (
    <>
      <Presenter
        token={token}
        proxyOrigin={config.proxyOrigin}
        isAdmin={false}
        viewer={viewer}
        name={project.name}
        defaultDevice={project.device}
        lockedDevice={project.lockDevice ? project.device : undefined}
        left={
          <>
            <BrandMark className="size-7 text-[13px]" />
            <span className="truncate text-sm font-semibold">{project.name}</span>
          </>
        }
        right={
          <button
            onClick={() => setRenaming(true)}
            title={`Commenting as ${viewer.identity.name} · Change name`}
            aria-label={`Commenting as ${viewer.identity.name}. Change name`}
            className="ml-1 rounded-full ring-2 ring-transparent transition-shadow hover:ring-white/25 focus-visible:outline-none focus-visible:ring-brand/60"
          >
            <Avatar name={viewer.identity.name} seed={viewer.identity.id} size={30} />
          </button>
        }
      />
      <RenameDialog
        open={renaming}
        current={viewer.identity.name}
        onClose={() => setRenaming(false)}
        onSave={(name) => {
          viewer.setName(name);
          setRenaming(false);
        }}
      />
    </>
  );
}

function Welcome({ project, onEnter }: { project: ProjectPublic; onEnter: (name: string) => void }) {
  const [name, setName] = useState('');
  const DeviceIcon = project.device === 'desktop' ? Laptop : Smartphone;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) onEnter(name.trim());
  }

  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-stage p-5 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-3xl" />

      <form onSubmit={submit} className="relative w-full max-w-[400px] animate-pop-in rounded-2xl border border-line bg-panel p-7 shadow-2xl">
        <BrandMark className="size-10 text-base" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">You’re invited to review</p>
        <h1 className="mt-1.5 text-xl font-bold leading-tight tracking-tight">{project.name}</h1>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-white/55">
          <DeviceIcon className="size-4" />
          Interactive {project.device === 'desktop' ? 'desktop' : 'mobile'} prototype
        </p>

        <label className="mt-7 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-white/85">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah Ahmed"
            maxLength={60}
            autoFocus
            autoComplete="name"
            className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-brand/70"
          />
          <span className="mt-1.5 block text-xs text-white/40">
            Shown next to your comments so the team knows who said what.
          </span>
        </label>

        <button
          disabled={!name.trim()}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-bold text-brand-foreground transition-[filter,opacity,transform] hover:brightness-95 active:scale-[0.99] disabled:opacity-40"
        >
          View prototype <ArrowRight className="size-4" />
        </button>
      </form>
    </div>
  );
}

function RenameDialog({ open, current, onClose, onSave }: { open: boolean; current: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(current);
  useEffect(() => {
    if (open) setName(current);
  }, [open, current]);
  return (
    <Dialog open={open} onClose={onClose} title="Your name" description="Used on the comments you leave from now on." width="max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
        className="space-y-4 px-6 pb-6 pt-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          aria-label="Your name"
          className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring/40 focus:ring-2 focus:ring-ring/15"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-semibold hover:bg-accent">Cancel</button>
          <button disabled={!name.trim()} className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50">Save</button>
        </div>
      </form>
    </Dialog>
  );
}
