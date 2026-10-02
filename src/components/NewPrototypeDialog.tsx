import { useState, type FormEvent } from 'react';
import { EyeOff } from 'lucide-react';
import type { Device, ProjectAdmin } from '../../shared/types';
import { api } from '../lib/api';
import { DeviceLock, DevicePicker } from './DevicePicker';
import { Button, Dialog, Field, Input, Spinner } from './ui';

export function NewPrototypeDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: ProjectAdmin) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [lockDevice, setLockDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const p = await api<ProjectAdmin>('/projects', { method: 'POST', body: { name, url, device, lockDevice } });
      setName('');
      setUrl('');
      setDevice('desktop');
      setLockDevice(false);
      onCreated(p);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New prototype" description="Present a live website inside a device mockup.">
      <form onSubmit={submit} className="space-y-5 px-6 pb-6 pt-5">
        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client — Homepage redesign" maxLength={120} required />
        </Field>
        <Field
          label="Website link"
          hint={
            <span className="inline-flex items-start gap-1.5">
              <EyeOff className="mt-px size-3.5 flex-none" />
              Only admins can see this. Viewers get an encrypted share link and never see the real address.
            </span>
          }
        >
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://staging.client-site.com" inputMode="url" autoCapitalize="off" spellCheck={false} required />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Device</span>
          <DevicePicker value={device} onChange={setDevice} />
          <DeviceLock device={device} checked={lockDevice} onChange={setLockDevice} />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="brand" disabled={busy || !name.trim() || !url.trim()}>
            {busy ? <><Spinner /> Checking site…</> : 'Create prototype'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
