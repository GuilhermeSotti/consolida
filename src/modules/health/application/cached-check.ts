/**
 * Coalesces an expensive health probe: at most one execution per `ttlMs`, and concurrent callers
 * share the in-flight execution. Protects the database from a public, unthrottled readiness
 * endpoint being called in a loop while keeping the result fresh for orchestrator probes.
 */
export class CachedCheck {
  private last: { ok: boolean; at: number } | null = null;
  private inflight: Promise<boolean> | null = null;

  constructor(
    private readonly probe: () => Promise<unknown>,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(): Promise<boolean> {
    if (this.last && this.now() - this.last.at < this.ttlMs) return Promise.resolve(this.last.ok);
    if (!this.inflight) {
      this.inflight = this.probe()
        .then(
          () => true,
          () => false,
        )
        .then((ok) => {
          this.last = { ok, at: this.now() };
          this.inflight = null;
          return ok;
        });
    }
    return this.inflight;
  }
}
