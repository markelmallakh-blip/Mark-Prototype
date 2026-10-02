export type Device = 'desktop' | 'mobile';

export const DEVICES: Record<Device, { label: string; width: number; height: number }> = {
  desktop: { label: 'MacBook', width: 1512, height: 982 },
  mobile: { label: 'Mobile', width: 430, height: 932 },
};

/** Admin view of a project — the only shape that carries the website URL. */
export interface ProjectAdmin {
  id: string;
  name: string;
  url: string;
  targetOrigin: string;
  startPath: string;
  device: Device;
  shareToken: string;
  shareEnabled: boolean;
  /** Viewers only get `device`; the Desktop/Mobile switch is hidden from them. */
  lockDevice: boolean;
  createdAt: string;
  updatedAt: string;
  previewKey: string;
}

/** What anyone holding the share link receives. Never includes the URL. */
export interface ProjectPublic {
  name: string;
  device: Device;
  lockDevice: boolean;
}

export interface AppConfig {
  proxyOrigin: string;
  authRequired: boolean;
  /** Set when admins sign in with Google instead of a password. */
  googleClientId?: string;
}
