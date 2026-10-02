// Production: the whole app on Cloudflare.
//   APP host      → the app (static files) + /api (Durable Object below)
//   PREVIEW host  → masked previews (server/core/proxy.ts)
import { DurableObject } from 'cloudflare:workers';
import BRIDGE from '../server/bridge.js';
import { handleApi, lookupTarget } from '../server/core/api.ts';
import { randomId } from '../server/core/crypto.ts';
import { handleProxy } from '../server/core/proxy.ts';
import type { Core, Project, ProxyTarget } from '../server/core/types.ts';

export interface Env {
  STORE: DurableObjectNamespace<Store>;
  ASSETS: Fetcher;
  PREVIEW_ORIGIN: string;
  /** Set with `wrangler secret put ADMIN_PASSWORD`. */
  ADMIN_PASSWORD?: string;
  /** Local `wrangler dev` only (`--var ALLOW_NO_PASSWORD:1`): skip admin sign-in. Never set in production. */
  ALLOW_NO_PASSWORD?: string;
}

const store = (env: Env) => env.STORE.get(env.STORE.idFromName('main'));

// Preview requests (every asset of every page) look up their project; cache briefly per isolate.
const targets = new Map<string, { at: number; target: ProxyTarget | null }>();
async function lookup(env: Env, value: string) {
  const hit = targets.get(value);
  if (hit && Date.now() - hit.at < 15_000) return hit.target;
  const r = await store(env).fetch(`https://store/__lookup?v=${encodeURIComponent(value)}`);
  const target = (await r.json()) as ProxyTarget | null;
  targets.set(value, { at: Date.now(), target });
  return target;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const previewHost = new URL(env.PREVIEW_ORIGIN).host;
    if (url.host === previewHost || req.headers.get('host') === previewHost) {
      return handleProxy(req, { lookup: (v) => lookup(env, v), bridge: () => BRIDGE, origin: env.PREVIEW_ORIGIN });
    }
    if (url.pathname.startsWith('/api/')) return store(env).fetch(req);
    const asset = await env.ASSETS.fetch(req);
    // App routes like /prototype/abc or /p/token are client-side: serve the app shell.
    if (asset.status === 404 && req.method === 'GET' && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL('/', url), req));
    }
    return asset;
  },
} satisfies ExportedHandler<Env>;

/** All projects live in one Durable Object: a single consistent copy. */
export class Store extends DurableObject<Env> {
  private core!: Core;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const storage = ctx.storage;
      let secret = await storage.get<string>('secret');
      if (!secret) {
        secret = randomId(32);
        await storage.put('secret', secret);
      }
      const projects = (await storage.get<Project[]>('projects')) ?? [];

      this.core = {
        data: { projects },
        secret,
        adminPassword: env.ADMIN_PASSWORD ?? '',
        requirePassword: env.ALLOW_NO_PASSWORD !== '1',
        proxyOrigin: () => env.PREVIEW_ORIGIN,
        persist: async () => {
          await storage.put('projects', this.core.data.projects);
          targets.clear();
        },
      };
    });
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === '/__lookup') {
      return Response.json(await lookupTarget(this.core, url.searchParams.get('v') ?? ''));
    }
    return handleApi(req, this.core);
  }
}
