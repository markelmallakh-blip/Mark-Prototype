import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Laptop, Lock, RotateCw, Smartphone } from 'lucide-react';
import { DEVICES, type Device } from '../../../shared/types';
import { cn } from '../../lib/format';
import { previewSrc } from '../../lib/runtime';
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
}

type Zoom = 'fit' | 0.5 | 0.75 | 1;
type BridgeMsg = { type: 'ready' | 'route' | 'title'; path: string; title: string };

const STAGE_PAD = 40;

export function Presenter(props: PresenterProps) {
  const { token, proxyOrigin, previewKey, isAdmin } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [device, setDevice] = useState<Device>(props.defaultDevice);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [page, setPage] = useState<{ path: string; title: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [frame, setFrame] = useState({ key: 0, path: '' });

  const src = previewSrc({ proxyOrigin, token, previewKey, path: frame.path });
  // Messages are only exchanged with the preview origin.
  const frameOrigin = new URL(src, location.href).origin;

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

  // Locked to one device: nobody can switch. Admins still see the other option, dimmed; viewers don't.
  const canSwitchDevice = !props.lockedDevice;
  const showDeviceSwitch = isAdmin || canSwitchDevice;

  // --- Bridge messaging (which page is showing) ----------------------------

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow || e.origin !== frameOrigin) return;
      const d = e.data as BridgeMsg & { src?: string };
      if (d?.src !== 'pt') return;
      if (d.type === 'title') setPage((p) => (p ? { ...p, title: d.title } : p));
      else {
        setLoaded(true);
        setPage({ path: d.path, title: d.title });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameOrigin]);

  // --- Actions ------------------------------------------------------------

  // The frame markup differs per device, so switching remounts the iframe: reload it on the current page.
  function switchDevice(d: Device) {
    if (d === device || !canSwitchDevice) return;
    setDevice(d);
    setLoaded(false);
    setFrame((f) => ({ key: f.key + 1, path: page?.path ?? f.path }));
  }

  function reload() {
    setLoaded(false);
    setPage(null);
    setFrame((f) => ({ key: f.key + 1, path: page?.path ?? f.path }));
  }

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
          <IconButton label="Reload preview" onClick={reload}>
            <RotateCw className="size-4" />
          </IconButton>
          {props.right}
        </div>
      </header>

      {/* Stage */}
      <div ref={stageRef} className={cn('relative min-h-0 min-w-0 flex-1', zoom === 'fit' ? 'overflow-hidden' : 'overflow-auto')}>
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
                    iframeRef.current?.contentWindow?.postMessage({ src: 'pt-host', type: 'hello' }, frameOrigin);
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
      </div>
    </div>
  );
}

export function IconButton({ label, onClick, active, className, children }: {
  label: string;
  onClick: () => void;
  active?: boolean;
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
    </button>
  );
}
