import type { CommentThread, Device } from '../../shared/types.ts';

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
  nextNumber: number;
}

export interface StoredReply {
  id: string;
  author: string;
  authorId: string;
  /** SHA-256 of the commenter's browser secret: proves authorship for deletes. */
  secretHash: string;
  role: CommentThread['role'];
  text: string;
  createdAt: string;
}

export interface StoredComment extends Omit<CommentThread, 'replies'> {
  projectId: string;
  secretHash: string;
  replies: StoredReply[];
}

export interface Data {
  projects: Project[];
  comments: StoredComment[];
}

/** What a runtime (Node dev server or Cloudflare Durable Object) provides to the API. */
export interface Core {
  data: Data;
  /** Save changes. `projectId` narrows it to one project's comments when the runtime stores them separately. */
  persist(projectId?: string): void | Promise<void>;
  secret: string;
  /** '' means no admin sign-in (local dev only). */
  adminPassword: string;
  /** Refuse admin access entirely when no password is configured (production). */
  requirePassword: boolean;
  /** "Sign in with Google" OAuth client ID. When set, it replaces the password sign-in. */
  googleClientId: string;
  /** Google emails allowed into the admin area (lower-case). */
  adminEmails: string[];
  /** Origin of the masked preview host, as seen from this request. */
  proxyOrigin(req: Request): string;
}

/** What the preview proxy needs to know about a project. */
export interface ProxyTarget {
  targetOrigin: string;
  startPath: string;
}
