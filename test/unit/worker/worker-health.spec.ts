import type { AddressInfo } from 'node:net';
import { leaseHeartbeatIntervalMs, livenessThresholdMs, startWorkerHealthServer, WorkerLiveness } from '../../../src/worker/worker-health';

describe('worker liveness', () => {
  it('derives the lease heartbeat and the stale threshold from the configuration', () => {
    expect(leaseHeartbeatIntervalMs(300)).toBe(30_000);
    expect(leaseHeartbeatIntervalMs(30)).toBe(10_000);
    expect(leaseHeartbeatIntervalMs(1)).toBe(1000);
    expect(livenessThresholdMs(300, 2000)).toBe(92_000);
  });

  it('becomes not live when no progress is recorded within the threshold', () => {
    let now = 1_000_000;
    const liveness = new WorkerLiveness(10_000, () => now);
    now += 10_000;
    expect(liveness.isLive()).toBe(true);
    now += 1;
    expect(liveness.isLive()).toBe(false);
    liveness.markProgress();
    expect(liveness.isLive()).toBe(true);
    expect(liveness.secondsSinceProgress()).toBe(0);
  });

  it('serves GET /health/live with 200 while live and 503 when stalled; other paths are 404', async () => {
    let now = 0;
    const liveness = new WorkerLiveness(1000, () => now);
    const server = await startWorkerHealthServer(0, liveness, '127.0.0.1');
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const live = await fetch(`${base}/health/live`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'ok', secondsSinceProgress: 0 });
      now = 5000;
      expect((await fetch(`${base}/health/live`)).status).toBe(503);
      expect((await fetch(`${base}/metrics`)).status).toBe(404);
      expect((await fetch(`${base}/health/live`, { method: 'POST' })).status).toBe(404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
