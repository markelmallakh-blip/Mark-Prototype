import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUp, Check, CircleCheck, Laptop, MessageCircle, MoreHorizontal, Smartphone, Trash2, X } from 'lucide-react';
import type { CommentThread, Reply } from '../../../shared/types';
import { avatarColor, cn, initials, samePath, timeAgo } from '../../lib/format';

export function Avatar({ name, seed, size = 28 }: { name: string; seed: string; size?: number }) {
  return (
    <span
      className="grid flex-none select-none place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: avatarColor(seed), fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function TeamBadge() {
  return <span className="rounded bg-brand px-1 py-px text-[9px] font-bold uppercase tracking-wide text-brand-foreground">Team</span>;
}

/** Card pinned next to a point on screen (viewport coords), flipping/clamping to stay visible. */
export function Floating({ point, children, onDismiss }: { point: { x: number; y: number }; children: ReactNode; onDismiss?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 14;
    let left = point.x + gap + 20;
    let top = point.y - 36;
    if (left + w > window.innerWidth - 8) {
      // No room on the right: go above the pin rather than left, where it would cover an area selection.
      const above = point.y - 32 - gap - h;
      if (above >= 56) {
        left = point.x - w / 2 + 16;
        top = above;
      } else {
        left = point.x - w - gap;
      }
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(56, Math.min(top, window.innerHeight - h - 8));
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  });
  return (
    <div
      ref={ref}
      onKeyDown={(e) => e.key === 'Escape' && onDismiss?.()}
      className="fixed z-40 w-[320px] max-w-[calc(100vw-16px)] animate-pop-in overflow-hidden rounded-xl border border-black/5 bg-white text-neutral-900 shadow-[0_18px_50px_-12px_rgba(0,0,0,.55)]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {children}
    </div>
  );
}

function Composer({ placeholder, onSubmit, onCancel, needsName, autoFocus, submitLabel = 'Post' }: {
  placeholder: string;
  onSubmit: (text: string, name?: string) => Promise<void>;
  onCancel?: () => void;
  needsName: boolean;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = text.trim() && (!needsName || name.trim());

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(text.trim(), needsName ? name.trim() : undefined);
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel?.();
    }
  }

  return (
    <form onSubmit={submit} className="p-3">
      {needsName && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={60}
          autoFocus={autoFocus}
          aria-label="Your name"
          className="mb-2 h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white"
        />
      )}
      <div className="flex items-end gap-2 rounded-lg border border-neutral-200 bg-white p-1.5 pl-3 focus-within:border-neutral-400">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          autoFocus={autoFocus && !needsName}
          aria-label={placeholder}
          className="max-h-40 min-h-7 flex-1 resize-none bg-transparent py-1 text-sm leading-5 outline-none placeholder:text-neutral-400"
        />
        <button
          type="submit"
          disabled={!ready || busy}
          aria-label={submitLabel}
          className="grid size-7 flex-none place-items-center rounded-full bg-brand text-brand-foreground transition-opacity disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </form>
  );
}

export function DraftCard({ point, needsName, onSubmit, onCancel }: {
  point: { x: number; y: number };
  needsName: boolean;
  onSubmit: (text: string, name?: string) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Floating point={point} onDismiss={onCancel}>
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span className="text-xs font-semibold text-neutral-500">New comment</span>
        <button onClick={onCancel} aria-label="Cancel" className="grid size-6 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
          <X className="size-3.5" />
        </button>
      </div>
      <Composer placeholder="Add a comment" needsName={needsName} autoFocus onSubmit={onSubmit} onCancel={onCancel} />
    </Floating>
  );
}

export function ThreadCard({ point, thread, myId, isAdmin, needsName, onReply, onResolve, onDelete, onDeleteReply, onClose }: {
  point: { x: number; y: number };
  thread: CommentThread;
  myId: string;
  isAdmin: boolean;
  needsName: boolean;
  onReply: (text: string, name?: string) => Promise<void>;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  onDeleteReply: (r: Reply) => void;
  onClose: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const canDelete = isAdmin || thread.authorId === myId;
  return (
    <Floating point={point} onDismiss={onClose}>
      <div className="flex items-center gap-1 border-b border-neutral-100 px-3 py-2">
        <span className="text-xs font-semibold tabular-nums text-neutral-500">#{thread.number}</span>
        {thread.resolved && <span className="ml-1 rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">Resolved</span>}
        <div className="ml-auto flex items-center">
          <button
            onClick={() => onResolve(!thread.resolved)}
            aria-label={thread.resolved ? 'Reopen' : 'Resolve'}
            title={thread.resolved ? 'Reopen' : 'Resolve'}
            className={cn('grid size-7 place-items-center rounded-md hover:bg-neutral-100', thread.resolved ? 'text-emerald-600' : 'text-neutral-500')}
          >
            {thread.resolved ? <CircleCheck className="size-4" /> : <Check className="size-4" />}
          </button>
          {canDelete && (
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} aria-label="More" className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100">
                <MoreHorizontal className="size-4" />
              </button>
              {menu && (
                <button
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                  className="absolute right-0 top-8 z-10 flex items-center gap-2 whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-red-600 shadow-lg hover:bg-red-50"
                >
                  <Trash2 className="size-3.5" /> Delete thread
                </button>
              )}
            </div>
          )}
          <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[min(360px,50vh)] overflow-y-auto overscroll-contain">
        <Message name={thread.author} seed={thread.authorId} team={thread.role === 'team'} at={thread.createdAt} text={thread.text} />
        {thread.replies.map((r) => (
          <Message
            key={r.id}
            name={r.author}
            seed={r.authorId}
            team={r.role === 'team'}
            at={r.createdAt}
            text={r.text}
            onDelete={isAdmin || r.authorId === myId ? () => onDeleteReply(r) : undefined}
          />
        ))}
      </div>
      <div className="border-t border-neutral-100">
        <Composer placeholder="Reply" needsName={needsName} onSubmit={onReply} onCancel={onClose} submitLabel="Reply" />
      </div>
    </Floating>
  );
}

function Message({ name, seed, team, at, text, onDelete }: { name: string; seed: string; team: boolean; at: string; text: string; onDelete?: () => void }) {
  return (
    <div className="group flex gap-2.5 px-3 py-2.5">
      <Avatar name={name} seed={seed} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="truncate font-semibold text-neutral-900">{name}</span>
          {team && <TeamBadge />}
          <span className="flex-none text-neutral-400">{timeAgo(at)}</span>
          {onDelete && (
            <button onClick={onDelete} aria-label="Delete reply" className="ml-auto text-neutral-300 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-neutral-800">{text}</p>
      </div>
    </div>
  );
}

export type Scope = 'page' | 'all';

export function CommentsPanel({ comments, currentPath, device, scope, setScope, showResolved, setShowResolved, activeId, onSelect, onClose, onStartComment }: {
  comments: CommentThread[];
  currentPath: string | null;
  device: CommentThread['device'];
  scope: Scope;
  setScope: (s: Scope) => void;
  showResolved: boolean;
  setShowResolved: (v: boolean) => void;
  activeId: string | null;
  onSelect: (c: CommentThread) => void;
  onClose: () => void;
  onStartComment: () => void;
}) {
  const onPage = (c: CommentThread) => currentPath !== null && samePath(c.path, currentPath) && c.device === device;
  const visible = comments.filter((c) => showResolved || !c.resolved);
  const pageCount = visible.filter(onPage).length;
  const list = (scope === 'page' ? visible.filter(onPage) : visible).sort((a, b) => b.number - a.number);

  return (
    <aside className="flex h-full w-full flex-col bg-panel text-white" aria-label="Comments">
      <div className="flex h-12 flex-none items-center gap-2 border-b border-line px-4">
        <h2 className="text-sm font-semibold">Comments</h2>
        <span className="rounded-full bg-white/10 px-1.5 text-[11px] font-semibold tabular-nums text-white/70">{comments.filter((c) => !c.resolved).length}</span>
        <button onClick={onClose} aria-label="Close comments" className="ml-auto grid size-8 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2.5">
        <div className="flex rounded-lg bg-black/25 p-0.5 text-xs font-semibold" role="tablist">
          {(['page', 'all'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={cn('rounded-md px-2.5 py-1 transition-colors', scope === s ? 'bg-white/15 text-white shadow-sm' : 'text-white/55 hover:text-white')}
            >
              {s === 'page' ? `This page · ${pageCount}` : `All · ${visible.length}`}
            </button>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-white/60 hover:text-white">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="size-3.5 accent-[#0a84ff]" />
          Resolved
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {list.length === 0 && (
          <li className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 grid size-10 place-items-center rounded-full bg-white/8 text-white/50">
              <MessageCircle className="size-5" />
            </span>
            <p className="text-sm font-semibold text-white/85">{scope === 'page' ? 'No comments on this page' : 'No comments yet'}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              Press <kbd className="rounded bg-white/10 px-1 font-sans">C</kbd> or{' '}
              <button onClick={onStartComment} className="font-semibold text-brand hover:underline">start commenting</button>, then click a spot or drag over an area.
            </p>
          </li>
        )}
        {list.map((c) => {
          const DeviceIcon = c.device === 'desktop' ? Laptop : Smartphone;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c)}
                className={cn(
                  'group flex w-full gap-3 rounded-lg p-3 text-left transition-colors',
                  c.id === activeId ? 'bg-white/10' : 'hover:bg-white/[0.05]',
                  c.resolved && 'opacity-55',
                )}
              >
                <span className="relative">
                  <Avatar name={c.author} seed={c.authorId} size={30} />
                  <span className="absolute -bottom-1 -right-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[16px] text-brand-foreground ring-2 ring-panel tabular-nums">
                    {c.number}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="truncate font-semibold">{c.author}</span>
                    {c.role === 'team' && <TeamBadge />}
                    <span className="ml-auto flex-none text-white/40">{timeAgo(c.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap break-words text-[13px] leading-[18px] text-white/80">{c.text}</span>
                  <span className="mt-1.5 flex items-center gap-2.5 text-[11px] text-white/40">
                    {c.replies.length > 0 && <span className="flex-none whitespace-nowrap">{c.replies.length} {c.replies.length === 1 ? 'reply' : 'replies'}</span>}
                    {c.resolved && <span className="inline-flex flex-none items-center gap-0.5 whitespace-nowrap text-emerald-400"><Check className="size-3" /> Resolved</span>}
                    {scope === 'all' && (
                      <span className="ml-auto inline-flex min-w-0 items-center gap-1">
                        <DeviceIcon className="size-3 flex-none" />
                        <span className="truncate">{c.pageTitle || c.path}</span>
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

