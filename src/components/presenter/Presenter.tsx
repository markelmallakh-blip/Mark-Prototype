import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Laptop, Lock, MessageCirclePlus, MessagesSquare, RotateCw, Smartphone } from 'lucide-react';
import { DEVICES, type Anchor, type CommentThread, type Device, type Reply } from '../../../shared/types';
import { api } from '../../lib/api';
import { cn, samePath } from '../../lib/format';
import { useIdentity, type Viewer } from '../../lib/identity';
import { previewSrc, subscribeComments } from '../../lib/runtime';
import { CommentsPanel, DraftCard, ThreadCard, type Scope } from './Comments';
import { DeviceFrame, frameSize } from './DeviceFrame';

export interface PresenterProps {
  token: string;
  proxyOrigin: string;
  /** Admin-only: lets the preview load even when the public link is switched off. */
  previewKey?: string;
  isAdmin: boolean;
  name: string;
  defaultDevice: Device;
  /** Left of the top bar (back button, project name). */
  left: ReactNode;
  /** Right of the top bar (admin share/settings). */
  right?: ReactNode;
  /** "Show only the selected device": viewers get no Desktop/Mobile switch; admins see the other one dimmed. */
  lockedDevice?: Device;
  /** Commenter identity from the parent (share page asks for the name up front). */
  viewer?: Viewer;
}

type Zoom = 'fit' | 0.5 | 0.75 | 1;
interface Draft {
  anchor: Anchor;
  path: string;
  device: Device;
}
interface Track {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}
type BridgeMsg =
  | { type: 'ready' | 'route' | 'title'; path: string; title: string }
  | { type: 'place'; anchor: Anchor }
  | { type: 'pin'; id: string }
  | ({ type: 'track' } & Track)
  | { type: 'key'; key: string };

const STAGE_PAD = 40;

export function Presenter(props: PresenterProps) {
  const { token, proxyOrigin, previewKey, isAdmin } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ownViewer = useIdentity();
  const { identity, setName } = props.viewer ?? ownViewer;

  const [device, setDevice] = useState<Device>(props.defaultDevice);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [commentMode, setCommentMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1100);
  const [allComments, setComments] = useState<CommentThread[]>([]);
  const [page, setPage] = useState<{ path: string; title: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [scope, setScope] = useState<Scope>('page');
  const [showResolved, setShowResolved] = useState(false);
  const [frame, setFrame] = useState({ key: 0, path: '' });
  const [, forceRender] = useState(0);
  const pendingScroll = useRef<string | null>(null);

  const src = previewSrc({ proxyOrigin, token, previewKey, path: frame.path });
  // Messages are only exchanged with the preview origin.
  const frameOrigin = new URL(src, location.href).origin;

  // The comment bridge announces itself on load. Without it (a page the proxy couldn't inject into,
  // e.g. a non-HTML response) the page can still be viewed but not commented on.
  const connected = useRef(false);
  const [bridgeMissing, setBridgeMissing] = useState(false);
  useEffect(() => {
    connected.current = false;
    setBridgeMissing(false);
  }, [src, frame.key]);

  // --- Layout -------------------------------------------------------------

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fsize = frameSize(device);
  const fit = stage.w ? Math.min(1, (stage.w - STAGE_PAD * 2) / fsize.w, (stage.h - STAGE_PAD * 2) / fsize.h) : 0.5;
  const scale = Math.max(0.1, zoom === 'fit' ? fit : zoom);

  // --- Live comments ------------------------------------------------------

  useEffect(() => subscribeComments(token, previewKey, setComments), [token, previewKey]);

  // Locked to one device: nobody can switch. Admins still see the other option, dimmed; viewers don't.
  const canSwitchDevice = !props.lockedDevice;
  const showDeviceSwitch = isAdmin || canSwitchDevice;
  // A locked prototype only ever shows the one device, so hide threads left on the other.
  const comments = useMemo(
    () => (canSwitchDevice ? allComments : allComments.filter((c) => c.device === props.lockedDevice)),
    [allComments, canSwitchDevice, props.lockedDevice],
  );

  const upsert = useCallback((c: CommentThread) => {
    setComments((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]));
  }, []);

  // --- Bridge messaging -------------------------------------------------

  const send = useCallback(
    (msg: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage({ src: 'pt-host', ...msg }, frameOrigin),
    [frameOrigin],
  );

  const pinsVisible = commentMode || panelOpen;
  const pagePins = useMemo(
    () =>
      page
        ? comments.filter(
            (c) => c.device === device && samePath(c.path, page.path) && (showResolved || !c.resolved || c.id === activeId),
          )
        : [],
    [comments, page, device, showResolved, activeId],
  );
  const draftHere = draft && page && draft.device === device && samePath(draft.path, page.path) ? draft : null;
  const trackId = draftHere ? 'draft' : activeId;

  useEffect(() => {
    if (!page) return;
    send({
      type: 'state',
      mode: commentMode ? 'comment' : 'browse',
      scale,
      activeId,
      track: trackId,
      draft: draftHere?.anchor ?? null,
      pins: (pinsVisible ? pagePins : pagePins.filter((c) => c.id === activeId)).map((c) => ({
        id: c.id,
        n: c.number,
        anchor: c.anchor,
        resolved: c.resolved,
      })),
    });
  }, [send, page, commentMode, scale, activeId, trackId, draftHere, pinsVisible, pagePins]);

  const handleKey = useRef<(key: string) => void>(() => {});
  handleKey.current = (key) => {
    if (key === 'Escape') {
      if (draft) setDraft(null);
      else if (activeId) setActiveId(null);
      else if (commentMode) setCommentMode(false);
    } else if (key.toLowerCase() === 'c') {
      setCommentMode((v) => !v);
      setDraft(null);
    }
  };

  const onBridge = useRef<(d: BridgeMsg) => void>(() => {});
  onBridge.current = (d) => {
    switch (d.type) {
      case 'ready':
      case 'route': {
        setLoaded(true);
        connected.current = true;
        setBridgeMissing(false);
        const pathChanged = !page || !samePath(page.path, d.path);
        setPage({ path: d.path, title: d.title });
        if (pendingScroll.current) {
          send({ type: 'scrollTo', id: pendingScroll.current });
          pendingScroll.current = null;
        } else if (pathChanged) {
          setActiveId(null);
          setDraft(null);
        }
        break;
      }
      case 'title':
        setPage((p) => (p ? { ...p, title: d.title } : p));
        break;
      case 'place':
        if (!page) return;
        setActiveId(null);
        setDraft({ anchor: d.anchor, path: page.path, device });
        break;
      case 'pin':
        setDraft(null);
        setActiveId((id) => (id === d.id ? null : d.id));
        break;
      case 'track':
        setTrack({ id: d.id, x: d.x, y: d.y, visible: d.visible });
        break;
      case 'key':
        handleKey.current(d.key);
        break;
    }
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow || e.origin !== frameOrigin) return;
      if (e.data?.src === 'pt') onBridge.current(e.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameOrigin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' || e.key.toLowerCase() === 'c') handleKey.current(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Actions ------------------------------------------------------------

  // The frame markup differs per device, so switching remounts the iframe: reload it on the current page.
  function switchDevice(d: Device, path = page?.path) {
    if (d === device || !canSwitchDevice) return;
    setDevice(d);
    setDraft(null);
    setLoaded(false);
    setFrame((f) => ({ key: f.key + 1, path: path ?? f.path }));
  }

  function focusComment(c: CommentThread) {
    setDraft(null);
    setActiveId(c.id);
    if (c.device !== device) {
      pendingScroll.current = c.id;
      switchDevice(c.device, c.path);
    } else if (!page || !samePath(c.path, page.path)) {
      pendingScroll.current = c.id;
      send({ type: 'navigate', path: c.path });
    } else {
      send({ type: 'scrollTo', id: c.id });
    }
    if (window.innerWidth < 768) setPanelOpen(false);
  }

  function reload() {
    setLoaded(false);
    setPage(null);
    setFrame((f) => ({ key: f.key + 1, path: page?.path ?? f.path }));
  }

  const who = (name?: string) => {
    if (name) setName(name);
    return { author: name ?? identity.name, authorId: identity.id, secret: identity.secret };
  };

  async function postDraft(text: string, name?: string) {
    if (!draft) return;
    const c = await api<CommentThread>(`/share/${token}/comments`, {
      method: 'POST',
      previewKey,
      body: { ...who(name), text, anchor: draft.anchor, path: draft.path, device: draft.device, pageTitle: page?.title ?? '' },
    });
    upsert(c);
    setDraft(null);
  }

  const active = comments.find((c) => c.id === activeId) ?? null;

  async function reply(text: string, name?: string) {
    if (!active) return;
    upsert(await api<CommentThread>(`/share/${token}/comments/${active.id}/replies`, { method: 'POST', previewKey, body: { ...who(name), text } }));
  }

  async function resolve(resolved: boolean) {
    if (!active) return;
    upsert(await api<CommentThread>(`/share/${token}/comments/${active.id}`, { method: 'PATCH', previewKey, body: { resolved, by: identity.name } }));
    if (resolved && !showResolved) setActiveId(null);
  }

  async function remove() {
    if (!active || !confirm('Delete this comment thread?')) return;
    await api(`/share/${token}/comments/${active.id}`, { method: 'DELETE', previewKey, body: { secret: identity.secret } });
    setComments((cs) => cs.filter((c) => c.id !== active.id));
    setActiveId(null);
  }

  async function removeReply(r: Reply) {
    if (!active) return;
    upsert(await api<CommentThread>(`/share/${token}/comments/${active.id}/replies/${r.id}`, { method: 'DELETE', previewKey, body: { secret: identity.secret } }));
  }

  // --- Popover position (iframe coords → window coords) -------------------

  let point: { x: number; y: number } | null = null;
  if (track && track.visible && track.id === trackId && iframeRef.current) {
    const r = iframeRef.current.getBoundingClientRect();
    point = { x: r.left + track.x * scale, y: r.top + track.y * scale };
  }

  const needsName = !identity.name;
  const DeviceIcon = device === 'desktop' ? Laptop : Smartphone;

  return (
    <div className="flex h-full flex-col bg-stage text-white">
      {/* Top bar */}
      <header className="relative z-30 flex h-12 flex-none items-center gap-2 border-b border-line bg-chrome px-2 sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {props.left}
          {page?.title && (
            <span className="hidden min-w-0 items-center gap-1.5 text-xs text-white/45 lg:flex">
              <span className="text-white/20">/</span>
              <span className="truncate">{page.title}</span>
            </span>
          )}
        </div>

        {showDeviceSwitch ? (
          <div className="flex flex-none items-center rounded-lg bg-black/25 p-0.5" role="radiogroup" aria-label="Device">
            {(['desktop', 'mobile'] as const).map((d) => {
              const Icon = d === 'desktop' ? Laptop : Smartphone;
              const unavailable = !!props.lockedDevice && d !== props.lockedDevice;
              return (
                <span key={d} className="group/device relative">
                  <button
                    role="radio"
                    aria-checked={device === d}
                    aria-disabled={unavailable || undefined}
                    aria-describedby={unavailable ? `device-${d}-unavailable` : undefined}
                    onClick={() => !unavailable && switchDevice(d)}
                    title={unavailable ? undefined : `${DEVICES[d].label} · ${DEVICES[d].width}×${DEVICES[d].height}`}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors',
                      unavailable
                        ? 'cursor-not-allowed text-white/25'
                        : device === d
                          ? 'bg-brand text-brand-foreground shadow-sm'
                          : 'text-white/55 hover:text-white',
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{d === 'desktop' ? 'Desktop' : 'Mobile'}</span>
                    {unavailable && <Lock className="size-3" aria-hidden />}
                  </button>
                  {unavailable && (
                    <span
                      id={`device-${d}-unavailable`}
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-[-2px] whitespace-nowrap rounded-md bg-neutral-950 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-[opacity,transform] duration-150 group-hover/device:translate-y-0 group-hover/device:opacity-100 group-focus-within/device:translate-y-0 group-focus-within/device:opacity-100"
                    >
                      <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-neutral-950" aria-hidden />
                      Currently Not Available
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <div
            className="flex h-9 flex-none items-center gap-1.5 rounded-lg bg-black/25 px-3 text-xs font-semibold text-white/80"
            title={`${DEVICES[device].width}×${DEVICES[device].height}`}
          >
            <DeviceIcon className="size-4" />
            <span className="hidden sm:inline">{device === 'desktop' ? 'Desktop' : 'Mobile'}</span>
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <select
            value={String(zoom)}
            onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : (Number(e.target.value) as Zoom))}
            aria-label="Zoom"
            className="hidden h-8 rounded-md bg-transparent px-1.5 text-xs font-semibold tabular-nums text-white/70 outline-none hover:bg-white/10 md:block [&>option]:text-black"
          >
            <option value="fit">Fit · {Math.round(fit * 100)}%</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
          </select>
          <IconButton label="Reload preview" onClick={reload} className="max-sm:hidden">
            <RotateCw className="size-4" />
          </IconButton>
          <IconButton
            label="Comment (C)"
            active={commentMode}
            onClick={() => {
              setCommentMode((v) => !v);
              setDraft(null);
            }}
          >
            <MessageCirclePlus className="size-[18px]" />
          </IconButton>
          <IconButton label="Comments panel" active={panelOpen} onClick={() => setPanelOpen((v) => !v)} badge={comments.filter((c) => !c.resolved).length}>
            <MessagesSquare className="size-[18px]" />
          </IconButton>
          {props.right}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Stage */}
        <div
          ref={stageRef}
          onScroll={() => forceRender((n) => n + 1)}
          className={cn('relative min-w-0 flex-1', zoom === 'fit' ? 'overflow-hidden' : 'overflow-auto')}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="flex min-h-full min-w-full items-center justify-center" style={{ padding: STAGE_PAD }}>
            <div className="relative flex-none" style={{ width: fsize.w * scale, height: fsize.h * scale }}>
              <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
                <DeviceFrame device={device}>
                  <iframe
                    key={frame.key}
                    ref={iframeRef}
                    src={src}
                    title={props.name}
                    onLoad={() => {
                      setLoaded(true);
                      send({ type: 'hello' });
                      setTimeout(() => !connected.current && setBridgeMissing(true), 3500);
                    }}
                    // No allow-top-navigation or escaping popups: the preview can't take over the tab or open itself elsewhere.
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                    allow="fullscreen; autoplay"
                    referrerPolicy="no-referrer"
                    className="block border-0 bg-white"
                    style={{ width: DEVICES[device].width, height: DEVICES[device].height }}
                  />
                  {!loaded && (
                    <div className="absolute inset-0 grid place-items-center bg-neutral-50">
                      <div className="flex flex-col items-center gap-3 text-neutral-400" style={{ transform: `scale(${1 / scale})` }}>
                        <DeviceIcon className="size-7 animate-pulse" />
                        <span className="text-sm font-medium">Loading preview…</span>
                      </div>
                    </div>
                  )}
                </DeviceFrame>
              </div>
            </div>
          </div>

          {commentMode && !draft && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
              <div className="animate-pop-in rounded-full bg-black/75 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
                {bridgeMissing ? (
                  'Comments aren’t available on this page yet'
                ) : (
                  <>
                    Click to comment, or drag to select an area · <kbd className="font-sans text-white/60">Esc</kbd> to exit
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Comments column */}
        {panelOpen && (
          <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[340px] animate-slide-in border-l border-line shadow-2xl md:static md:w-[320px] md:flex-none md:shadow-none">
            <CommentsPanel
              comments={comments}
              currentPath={page?.path ?? null}
              device={device}
              scope={scope}
              setScope={setScope}
              showResolved={showResolved}
              setShowResolved={setShowResolved}
              activeId={activeId}
              onSelect={focusComment}
              onClose={() => setPanelOpen(false)}
              onStartComment={() => setCommentMode(true)}
            />
          </div>
        )}
      </div>

      {point && draftHere && (
        <DraftCard point={point} needsName={needsName} onSubmit={postDraft} onCancel={() => setDraft(null)} />
      )}
      {point && !draftHere && active && (
        <ThreadCard
          key={active.id}
          point={point}
          thread={active}
          myId={identity.id}
          isAdmin={isAdmin}
          needsName={needsName}
          onReply={reply}
          onResolve={resolve}
          onDelete={remove}
          onDeleteReply={removeReply}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

export function IconButton({ label, onClick, active, badge, className, children }: {
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'relative grid size-9 flex-none place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        active ? 'bg-brand text-brand-foreground' : 'text-white/70 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {children}
      {!!badge && !active && (
        <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-brand-foreground tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
