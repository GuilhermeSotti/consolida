import { JwksClient, type FetchLike } from '../../../src/modules/auth/infrastructure/jwt/jwks.client';
import { generateTestKey } from '../../support/jwt';

const JWKS_URI = 'https://login.microsoftonline.com/tenant/discovery/v2.0/keys';
const k1 = generateTestKey('k1');
const k2 = generateTestKey('k2');

function fakeFetch(responses: Array<{ ok: boolean; status?: number; body?: unknown } | Error>) {
  const calls: string[] = [];
  const impl: FetchLike = async (url) => {
    calls.push(url);
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    return { ok: next!.ok, status: next!.status ?? 200, json: async () => next!.body };
  };
  return { impl, calls };
}

describe('JwksClient', () => {
  it('requires https', () => {
    expect(() => new JwksClient({ jwksUri: 'http://insecure' })).toThrow('https');
  });

  it('fetches once and serves cached keys', async () => {
    const { impl, calls } = fakeFetch([{ ok: true, body: { keys: [k1.jwk] } }]);
    const client = new JwksClient({ jwksUri: JWKS_URI, fetch: impl });
    expect(await client.getSigningKey('k1')).not.toBeNull();
    expect(await client.getSigningKey('k1')).not.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('refreshes on unknown kid (key rotation) but at most once per interval', async () => {
    let now = 1_000_000;
    const { impl, calls } = fakeFetch([
      { ok: true, body: { keys: [k1.jwk] } },
      { ok: true, body: { keys: [k1.jwk, k2.jwk] } },
    ]);
    const client = new JwksClient({ jwksUri: JWKS_URI, fetch: impl, now: () => now, minRefreshIntervalMs: 60_000 });
    expect(await client.getSigningKey('k1')).not.toBeNull();
    expect(await client.getSigningKey('k2')).toBeNull(); // within the interval: no refresh
    expect(calls).toHaveLength(1);
    now += 60_000;
    expect(await client.getSigningKey('k2')).not.toBeNull();
    expect(calls).toHaveLength(2);
    expect(await client.getSigningKey('unknown')).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('keeps serving cached keys when the endpoint fails after expiry', async () => {
    let now = 0;
    const { impl, calls } = fakeFetch([{ ok: true, body: { keys: [k1.jwk] } }, new Error('network down')]);
    const client = new JwksClient({ jwksUri: JWKS_URI, fetch: impl, now: () => now, cacheTtlMs: 1000, minRefreshIntervalMs: 500 });
    expect(await client.getSigningKey('k1')).not.toBeNull();
    now = 5000;
    expect(await client.getSigningKey('k1')).not.toBeNull();
    expect(calls).toHaveLength(2);
    expect(await client.getSigningKey('k1')).not.toBeNull();
    expect(calls).toHaveLength(2); // rate limited
  });

  it('shares one request between concurrent lookups', async () => {
    const { impl, calls } = fakeFetch([{ ok: true, body: { keys: [k1.jwk] } }]);
    const client = new JwksClient({ jwksUri: JWKS_URI, fetch: impl });
    const results = await Promise.all([client.getSigningKey('k1'), client.getSigningKey('k1'), client.getSigningKey('k1')]);
    expect(results.every((key) => key !== null)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('ignores unusable keys and rejects empty key sets', async () => {
    const { impl } = fakeFetch([{ ok: true, body: { keys: [{ ...k1.jwk, use: 'enc' }, { kty: 'EC', kid: 'ec' }] } }]);
    const client = new JwksClient({ jwksUri: JWKS_URI, fetch: impl });
    expect(await client.getSigningKey('k1')).toBeNull();
  });

  it('treats non-2xx responses as failures', async () => {
    const { impl } = fakeFetch([{ ok: false, status: 503, body: {} }]);
    const client = new JwksClient({ jwksUri: JWKS_URI, fetch: impl });
    expect(await client.getSigningKey('k1')).toBeNull();
  });
});
