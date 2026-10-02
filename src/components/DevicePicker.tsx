import { Laptop, Lock, Smartphone } from 'lucide-react';
import { DEVICES, type Device } from '../../shared/types';
import { cn } from '../lib/format';
import { Switch } from './ui';

export function DevicePicker({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  return (
    <div role="radiogroup" aria-label="Device" className="grid grid-cols-2 gap-3">
      {(['desktop', 'mobile'] as const).map((d) => {
        const Icon = d === 'desktop' ? Laptop : Smartphone;
        const on = value === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(d)}
            className={cn(
              'flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
              on ? 'border-brand bg-brand/10' : 'border-border hover:border-foreground/20',
            )}
          >
            <span className={cn('grid size-9 place-items-center rounded-lg', on ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground')}>
              <Icon className="size-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{DEVICES[d].label}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">
                {DEVICES[d].width} × {DEVICES[d].height}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Show only the selected device": hides the Desktop/Mobile switch from viewers. */
export function DeviceLock({ device, checked, onChange }: { device: Device; checked: boolean; onChange: (v: boolean) => void }) {
  const other = device === 'desktop' ? 'mobile' : 'desktop';
  return (
    <div className={cn('mt-3 flex items-start gap-3 rounded-xl border p-3.5 transition-colors', checked && 'border-brand/60 bg-brand/5')}>
      <span className={cn('mt-0.5 grid size-7 flex-none place-items-center rounded-lg', checked ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground')}>
        <Lock className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Show only the selected device</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {checked
            ? `Viewers only see the ${DEVICES[device].label} view. The ${DEVICES[other].label} option stays hidden until you turn this off.`
            : `Viewers can switch between ${DEVICES.desktop.label} and ${DEVICES.mobile.label}. Turn on while ${DEVICES[other].label} isn\u2019t ready, or for app-only prototypes.`}
        </span>
      </div>
      <Switch checked={checked} onChange={onChange} label="Show only the selected device" />
    </div>
  );
}
