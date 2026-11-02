import type { KeyObject } from 'node:crypto';
import { publicKeyFromJwk, type SigningKeyResolver } from './access-token.verifier';

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface JwksClientOptions {
  /** Observes refresh failures (they are otherwise absorbed so cached keys keep working). */
  onRefreshError?: (error: unknown) => void;
  jwksUri: string;
  /** How long fetched keys are trusted before a background refresh (default 12h). */
  cacheTtlMs?: number;
  /** Minimum interval between refreshes triggered by unknown `kid` values (default 60s). */
  minRefreshIntervalMs?: number;
  timeoutMs?: number;
  fetch?: FetchLike;
  now?: () => number;
}

/**
 * Fetches and caches the tenant signing keys (JWKS). Unknown `kid` values trigger at most one
 * refresh per `minRefreshIntervalMs`, which supports key rotation without allowing an attacker
 * to force unlimited outbound requests. Concurrent refreshes share the same promise.
 */
export class JwksClient implements SigningKeyResolver {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<void> | null = null;
  private readonly ttl: number;
  private readonly minInterval: number;
  private readonly timeout: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;

  constructor(private readonly options: JwksClientOptions) {
    if (!/^https:\/\//.test(options.jwksUri)) throw new Error('jwksUri must use https.');
    this.ttl = options.cacheTtlMs ?? 12 * 60 * 60 * 1000;
    this.minInterval = options.minRefreshIntervalMs ?? 60 * 1000;
    this.timeout = options.timeoutMs ?? 5000;
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.now = options.now ?? Date.now;
  }

  async getSigningKey(kid: string): Promise<KeyObject | null> {
    const known = this.keys.has(kid);
    const stale = this.now() - this.fetchedAt > this.ttl;
    if (known && !stale) return this.keys.get(kid) ?? null;
    const canRefresh = this.inFlight !== null || this.now() - this.lastAttemptAt >= this.minInterval;
    if (canRefresh) {
      try {
        await this.refresh();
      } catch (error) {
        // Keep serving previously fetched keys if the endpoint is temporarily unavailable;
        // the next attempt is rate limited by minRefreshIntervalMs.
        this.options.onRefreshError?.(error);
      }
    }
    return this.keys.get(kid) ?? null;
  }

  private refresh(): Promise<void> {
    if (!this.inFlight) {
      this.lastAttemptAt = this.now();
      this.inFlight = this.load().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async load(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetchImpl(this.options.jwksUri, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`JWKS endpoint responded ${response.status}`);
      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) throw new Error('JWKS response without keys');
      const next = new Map<string, KeyObject>();
      for (const entry of body.keys.slice(0, 50)) {
        if (typeof entry !== 'object' || entry === null) continue;
        const jwk = entry as Record<string, unknown>;
        if (typeof jwk.kid !== 'string') continue;
        const key = publicKeyFromJwk(jwk);
        if (key) next.set(jwk.kid, key);
      }
      if (next.size === 0) throw new Error('JWKS response without usable RSA keys');
      this.keys = next;
      this.fetchedAt = this.now();
    } finally {
      clearTimeout(timer);
    }
  }
}
