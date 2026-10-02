# Prototype

Share a live website with a client the way you'd share a Figma prototype: inside a MacBook or iPhone mockup, **view only**, and without the client ever seeing the website's real address.

## Run it

```bash
npm install
npm run dev
```

- App: http://localhost:5280/prototype
- API: `:5281` · masked preview origin: `:5282`

With no `ADMIN_PASSWORD` set, admin sign-in is skipped (local dev only). Copy `.env.example` to `.env` to configure.

## How it works

| Piece | What it does |
| --- | --- |
| `/prototype` | Admin list of prototypes and **New prototype** (name, website link, MacBook 1512×982 or Mobile 430×932, optional "show only this device"). |
| `/prototype/:id` | Admin presenter, plus **Share** (copy link, link on/off, reset link) and **Settings** (name, website link, default device, delete). |
| `/p/:token` | What the client opens: the device mockup and a Desktop/Mobile switch. No URL anywhere, no comments, no sign-in. |
| `server/core/proxy.ts` | The **masked preview origin**. The iframe loads this origin, which forwards requests to the real site and rewrites its host, so the browser only ever sees the preview host. |
| `server/bridge.js` | Injected into every previewed page. Reports the current page to the presenter and keeps links inside the prototype. |
| `server/core/api.ts` | Projects (admin only; the only responses that include the URL) and the public share info (name and device only). |

### How the link stays hidden

- **The share link is a random key.** `/p/<token>` carries 144 random bits and nothing about the site. The real URL is stored on the server and only returned to signed-in admins.
- **The site loads through the preview host.** Page HTML, CSS, JS and JSON are rewritten so links, redirects and API calls point at the preview host, never the real one. The favicon is fetched server-side for the same reason.
- **The preview only renders inside the prototype.** Opening the preview host directly (copying the frame address, "open in new tab") shows a notice instead of the site, because browsers mark those loads as top-level documents.
- **Reset link** issues a new key; the old link stops working immediately. **Link off** disables it without changing it.

## Deploying (Cloudflare)

The preview **must be a different origin** from the app, otherwise the previewed site could read the admin session. Use two subdomains of the same domain (the preview cookie has to work inside the iframe):

1. In `wrangler.jsonc`, replace `prototype.example.com` / `preview.example.com` and `PREVIEW_ORIGIN` with your subdomains.
2. `npx wrangler secret put ADMIN_PASSWORD`
3. `npm run deploy`

`npm run dev:worker` runs the Cloudflare version locally (`localhost:8787` = app, `127.0.0.1:8787` = previews).

## Limitations

- Sites that detect mobile by **user agent** on the server won't switch layouts. CSS breakpoints and JS width checks do.
- WebSocket-based features on the previewed site aren't proxied (dev-server hot reload, live chat widgets).
- Images and fonts served from another domain (e.g. a CDN bucket) load from that domain directly. That doesn't reveal the site's address.
- A determined, technical viewer can always see what the browser renders (that's what "view" means), but not the address it came from.
