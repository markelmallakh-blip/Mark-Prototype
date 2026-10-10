// Server-sent events for live comment updates. One hub per runtime instance
// (the Node process locally, the single Durable Object on Cloudflare).

const enc = new TextEncoder();

export class Hub {
  private subs = new Map<string, Set<WritableStreamDefaultWriter<Uint8Array>>>();
  private ping: ReturnType<typeof setInterval> | null = null;

  /** Opens a stream for `key`, sending `initial` first. */
  open(key: string, initial: string) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const set = this.subs.get(key) ?? new Set();
    this.subs.set(key, set);
    set.add(writer);
    this.write(key, writer, initial);
    this.ping ??= setInterval(() => this.pingAll(), 25000);
    return readable;
  }

  send(key: string, event: string) {
    for (const w of this.subs.get(key) ?? []) this.write(key, w, event);
  }

  private write(key: string, w: WritableStreamDefaultWriter<Uint8Array>, chunk: string) {
    // A failed write means the viewer went away.
    w.write(enc.encode(chunk)).catch(() => this.drop(key, w));
  }

  private drop(key: string, w: WritableStreamDefaultWriter<Uint8Array>) {
    this.subs.get(key)?.delete(w);
    w.abort().catch(() => {});
    if ([...this.subs.values()].every((s) => s.size === 0) && this.ping) {
      clearInterval(this.ping);
      this.ping = null;
    }
  }

  private pingAll() {
    for (const [key, set] of this.subs) for (const w of set) this.write(key, w, ': ping\n\n');
  }
}
