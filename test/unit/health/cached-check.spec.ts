import { CachedCheck } from '../../../src/modules/health/application/cached-check';

describe('CachedCheck (readiness probe)', () => {
  it('runs the probe at most once per TTL and shares in-flight executions', async () => {
    let now = 0;
    let calls = 0;
    let healthy = true;
    const check = new CachedCheck(async () => {
      calls += 1;
      if (!healthy) throw new Error('database down');
    }, 2000, () => now);
    expect(await Promise.all([check.check(), check.check(), check.check()])).toEqual([true, true, true]);
    expect(calls).toBe(1);
    healthy = false;
    now = 1999;
    expect(await check.check()).toBe(true);
    expect(calls).toBe(1);
    now = 2000;
    expect(await check.check()).toBe(false);
    expect(calls).toBe(2);
  });

  it('probes on every call when the TTL is zero', async () => {
    let calls = 0;
    const check = new CachedCheck(async () => void (calls += 1), 0);
    await check.check();
    await check.check();
    expect(calls).toBe(2);
  });
});
