// Second hostname for masked previews when there's no custom domain (e.g. two workers.dev hosts).
// Forwards every request to the main worker unchanged; it sees this host and serves the preview proxy.
interface Env {
  APP: Fetcher;
}

export default {
  fetch: (req, env) => env.APP.fetch(req),
} satisfies ExportedHandler<Env>;
