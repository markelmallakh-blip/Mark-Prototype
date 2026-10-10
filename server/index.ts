// Local development server: runs the shared core (server/core) on Node.
// Production runs the same core on Cloudflare (worker/index.ts).
import './env.ts';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable, pipeline } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { handleApi, lookupTarget } from './core/api.ts';
import { Hub } from './core/hub.ts';
import { handleProxy } from './core/proxy.ts';
import type { Core, Data, Project } from './core/types.ts';
import { ADMIN_EMAILS, ADMIN_PASSWORD, GOOGLE_CLIENT_ID, DATA_FILE, PORT, PROXY_ORIGIN, PROXY_PORT, SESSION_SECRET } from './config.ts';

function load(): Data {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Projects saved before comments existed have no comment counter yet.
    const projects = (d.projects ?? []).map((p: Project) => ({ ...p, nextNumber: p.nextNumber ?? 1 }));
    return { projects, comments: d.comments ?? [] };
  } catch {
    return { projects: [], comments: [] };
  }
}

let saveTimer: NodeJS.Timeout | null = null;
const core: Core = {
  data: load(),
  persist() {
    saveTimer ??= setTimeout(() => {
      saveTimer = null;
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(core.data, null, 2));
      fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
    }, 30);
  },
  secret: SESSION_SECRET,
  adminPassword: ADMIN_PASSWORD,
  requirePassword: false,
  googleClientId: GOOGLE_CLIENT_ID,
  adminEmails: ADMIN_EMAILS,
  proxyOrigin: (req) => {
    const u = new URL(req.url);
    return PROXY_ORIGIN || `${u.protocol}//${u.hostname}:${PROXY_PORT}`;
  },
};
const hub = new Hub();
const BRIDGE_FILE = new URL('./bridge.js', import.meta.url);

// --- Node <-> fetch adapter -------------------------------------------------------

function toRequest(req: http.IncomingMessage, res: http.ServerResponse): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), {
    method: req.method,
    headers,
    signal: abort.signal,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
    // @ts-expect-error Node needs this for streamed request bodies.
    duplex: hasBody ? 'half' : undefined,
  });
}

function send(res: http.ServerResponse, r: Response) {
  const cookies = r.headers.getSetCookie();
  r.headers.forEach((v, k) => {
    if (k !== 'set-cookie') res.setHeader(k, v);
  });
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.writeHead(r.status);
  if (!r.body) return res.end();
  pipeline(Readable.fromWeb(r.body as unknown as NodeReadableStream), res, () => {});
}

function serve(handler: (req: Request) => Promise<Response>) {
  return http.createServer((req, res) => {
    handler(toRequest(req, res))
      .then((r) => send(res, r))
      .catch((err) => {
        console.error(err);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
  });
}

serve((req) => handleApi(req, core, hub)).listen(PORT, () => console.log(`Prototype API on http://localhost:${PORT}`));
serve((req) =>
  handleProxy(req, {
    lookup: (value) => lookupTarget(core, value),
    bridge: () => fs.readFileSync(BRIDGE_FILE, 'utf8'), // re-read so bridge edits apply on reload
  }),
).listen(PROXY_PORT, () => console.log(`Preview origin on http://localhost:${PROXY_PORT}`));

if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set — admin sign-in is disabled (local dev only).');

// One misbehaving previewed site must never take the whole app down: log and keep serving.
process.on('uncaughtException', (err) => console.error('Uncaught error (server kept running):', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection (server kept running):', err));
