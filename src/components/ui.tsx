import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/format';

type Variant = 'brand' | 'primary' | 'outline' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  brand: 'bg-brand text-brand-foreground hover:brightness-95',
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-border bg-card text-foreground hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
  danger: 'bg-destructive text-white hover:opacity-90',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }>(
  function Button({ variant = 'primary', size = 'md', className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-semibold transition-[background-color,opacity,filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
          VARIANTS[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/15 focus:border-ring/40',
        className,
      )}
      {...props}
    />
  );
});

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, dark }: { checked: boolean; onChange: (v: boolean) => void; label: string; dark?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        checked ? 'bg-brand' : dark ? 'bg-white/15' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-[18px] bg-brand-foreground' : 'translate-x-0.5 bg-white',
        )}
      />
    </button>
  );
}

export function Dialog({ open, onClose, title, description, children, width = 'max-w-lg' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    (ref.current?.querySelector<HTMLElement>('input, textarea') ?? ref.current?.querySelector<HTMLElement>('button'))?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cn('w-full animate-pop-in rounded-2xl bg-card text-card-foreground shadow-2xl', width)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-label="Loading" />;
}
