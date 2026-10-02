import type { Device } from '../../shared/types.ts';

export interface Project {
  id: string;
  name: string;
  url: string;
  targetOrigin: string;
  startPath: string;
  device: Device;
  shareToken: string;
  shareEnabled: boolean;
  lockDevice?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Data {
  projects: Project[];
}

/** What a runtime (Node dev server or Cloudflare Durable Object) provides to the API. */
export interface Core {
  data: Data;
  persist(): void | Promise<void>;
  secret: string;
  /** '' means no admin sign-in (local dev only). */
  adminPassword: string;
  /** Refuse admin access entirely when no password is configured (production). */
  requirePassword: boolean;
  /** Origin of the masked preview host, as seen from this request. */
  proxyOrigin(req: Request): string;
}

/** What the preview proxy needs to know about a project. */
export interface ProxyTarget {
  targetOrigin: string;
  startPath: string;
}
