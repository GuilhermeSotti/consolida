import { createServer, type Server } from 'node:http';

/**
 * Liveness of the worker process. "Progress" is recorded by the polling loop on every cycle and,
 * while a job runs, after every successful lease heartbeat. A worker whose loop is stuck (hung
 * query, deadlock, blocked event loop) stops recording progress and becomes not-live, so the
 * platform restarts it; its job lease expires and another replica reclaims the job.
 */
export class WorkerLiveness {
  private lastProgressAt: number;

  constructor(
    /** Maximum time without progress before the worker is reported as not live. */
    readonly staleAfterMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.lastProgressAt = now();
  }

  markProgress(): void {
    this.lastProgressAt = this.now();
  }

  isLive(): boolean {
    return this.now() - this.lastProgressAt <= this.staleAfterMs;
  }

  /** Seconds since the last recorded progress (diagnostics only). */
  secondsSinceProgress(): number {
    return Math.round((this.now() - this.lastProgressAt) / 1000);
  }
}

/** Interval of the job lease heartbeat (also the progress signal while a job runs). */
export function leaseHeartbeatIntervalMs(leaseSeconds: number): number {
  return Math.max(1000, Math.min(30_000, (leaseSeconds * 1000) / 3));
}

/** Tolerates two missed lease heartbeats plus one polling cycle. */
export function livenessThresholdMs(leaseSeconds: number, pollIntervalMs: number): number {
  return 3 * leaseHeartbeatIntervalMs(leaseSeconds) + pollIntervalMs;
}

/**
 * Minimal HTTP liveness endpoint (`GET /health/live`) for platforms that only support HTTP/TCP
 * probes, such as Azure Container Apps. It exposes no data besides the status and is not
 * published through any ingress.
 */
export function startWorkerHealthServer(port: number, liveness: WorkerLiveness, host = '0.0.0.0'): Promise<Server> {
  const server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0];
    if (request.method !== 'GET' || path !== '/health/live') {
      response.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end('{"status":"not_found"}');
      return;
    }
    const live = liveness.isLive();
    response.writeHead(live ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ status: live ? 'ok' : 'stalled', secondsSinceProgress: liveness.secondsSinceProgress() }));
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
