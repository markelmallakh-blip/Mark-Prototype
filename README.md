# Prototype

Share a live website with a client the way you'd share a Figma prototype: inside a MacBook or iPhone mockup, with pinned comments, and without the client ever seeing the website's real address.

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
| `/p/:token` | What the client opens: the device mockup, a Desktop/Mobile switch, the comment tool (`C`) and the comments column. Visitors enter their name once; no URL anywhere, no sign-in. |
| `server/core/proxy.ts` | The **masked preview origin**. The iframe loads this origin, which forwards requests to the real site and rewrites its host, so the browser only ever sees the preview host. |
| `server/bridge.js` | Injected into every previewed page. Draws comment pins *inside* the page (so they stay on their spot while scrolling), captures clicks and area drags in comment mode, reports the current page, and keeps links inside the prototype. |
| `server/core/api.ts` | Projects (admin only; the only responses that include the URL), and share info + comments (public by token, live updates over SSE). Visitors can delete only their own comments; admins can delete any and comment as "team". |

### How the link stays hidden

- **The share link is a random key.** `/p/<token>` carries 144 random bits and nothing about the site. The real URL is stored on the server and only returned to signed-in admins.
- **The site loads through the preview host.** Page HTML, CSS, JS and JSON are rewritten so links, redirects and API calls point at the preview host, never the real one. The favicon is fetched server-side for the same reason.
- **The preview only renders inside the prototype.** Opening the preview host directly (copying the frame address, "open in new tab") shows a notice instead of the site, because browsers mark those loads as top-level documents.
- **Reset link** issues a new key; the old link stops working immediately. **Link off** disables it without changing it.

## Deploying (Cloudflare)

Live at **https://mark-prototype.markelmallakh.workers.dev** (dashboard: `/prototype`, client links: `/p/<key>`).
Previews come from **https://mark-prototype-preview.markelmallakh.workers.dev** (`wrangler.preview.jsonc`, forwards to the main worker).

The app and the preview must be:

- **Different origins**, otherwise the previewed site could read the admin session.
- **The same site** (subdomains of one registrable domain; `markelmallakh.workers.dev` counts, because `workers.dev` is a public suffix). The preview identifies its project with a cookie inside the iframe, and Safari blocks cookies in cross-site iframes entirely. This is why the app is not hosted on GitHub Pages.

```bash
npm run deploy          # build + deploy both workers
npm run deploy:pages    # republish the GitHub Pages redirect (old github.io links → the Cloudflare app)
```

Admins sign in with Google: `GOOGLE_CLIENT_ID` and `ADMIN_EMAILS` in `wrangler.jsonc`. The OAuth client's authorized JavaScript origins must include the app origin. To move to your own domain, use two subdomains of it (e.g. `prototype.` and `preview.`) as custom-domain routes and update `PREVIEW_ORIGIN`.

`npm run dev:worker` runs the Cloudflare version locally. To mimic production (same site, different origins), add `--var PREVIEW_ORIGIN:http://preview.localtest.me:8787` and open `http://app.localtest.me:8787`.

## Limitations

- Sites that detect mobile by **user agent** on the server won't switch layouts. CSS breakpoints and JS width checks do.
- WebSocket-based features on the previewed site aren't proxied (dev-server hot reload, live chat widgets).
- Images and fonts served from another domain (e.g. a CDN bucket) load from that domain directly. That doesn't reveal the site's address.
- A determined, technical viewer can always see what the browser renders (that's what "view" means), but not the address it came from.
