import { createHmac, type KeyObject } from 'node:crypto';
import {
  AccessTokenVerifier,
  publicKeyFromJwk,
  TokenRejectedError,
  type TokenRejectionReason,
} from '../../../src/modules/auth/infrastructure/jwt/access-token.verifier';
import {
  generateTestKey,
  signTestToken,
  TEST_API_CLIENT_ID,
  TEST_ISSUER,
  TEST_SPA_CLIENT_ID,
  TEST_TENANT,
  validClaims,
} from '../../support/jwt';

const NOW_MS = Date.UTC(2026, 9, 23, 12, 0, 0);
const NOW = Math.floor(NOW_MS / 1000);
const key = generateTestKey('key-1');
const otherKey = generateTestKey('key-2');

function verifier(overrides: Partial<ConstructorParameters<typeof AccessTokenVerifier>[0]> = {}, keys: Record<string, KeyObject> = { 'key-1': key.publicKey }) {
  return new AccessTokenVerifier(
    {
      issuer: TEST_ISSUER,
      audiences: [TEST_API_CLIENT_ID, `api://${TEST_API_CLIENT_ID}`],
      tenantId: TEST_TENANT,
      requiredScope: 'access_as_user',
      allowedClientIds: [TEST_SPA_CLIENT_ID],
      ...overrides,
    },
    { getSigningKey: async (kid: string) => keys[kid] ?? null },
  );
}

async function rejection(token: string, instance = verifier()): Promise<TokenRejectionReason> {
  try {
    await instance.verify(token, NOW_MS);
  } catch (error) {
    if (error instanceof TokenRejectedError) return error.reason;
    throw error;
  }
  throw new Error('token was accepted');
}

describe('AccessTokenVerifier', () => {
  it('accepts a valid Entra v2 access token and returns the stable identity', async () => {
    const result = await verifier().verify(signTestToken(key, validClaims(NOW)), NOW_MS);
    expect(result).toEqual({
      tenantId: TEST_TENANT,
      objectId: '0f0e0d0c-0b0a-4908-8706-050403020100',
      name: 'Maria Analista',
      preferredUsername: 'maria@empresa.com',
      email: undefined,
      scopes: ['access_as_user'],
      clientId: TEST_SPA_CLIENT_ID,
      expiresAt: NOW + 3600,
    });
  });

  it('accepts the api:// audience and an array audience', async () => {
    await expect(verifier().verify(signTestToken(key, validClaims(NOW, { aud: [`api://${TEST_API_CLIENT_ID}`] })), NOW_MS)).resolves.toBeDefined();
  });

  it('rejects a tampered payload (signature mismatch)', async () => {
    const [header, , signature] = signTestToken(key, validClaims(NOW)).split('.');
    const forgedPayload = Buffer.from(JSON.stringify(validClaims(NOW, { oid: '11111111-2222-4333-8444-555555555555' }))).toString('base64url');
    expect(await rejection(`${header}.${forgedPayload}.${signature}`)).toBe('INVALID_SIGNATURE');
  });

  it('rejects tokens signed by a key outside the JWKS (unknown kid) or with a forged kid', async () => {
    expect(await rejection(signTestToken(otherKey, validClaims(NOW)))).toBe('UNKNOWN_KEY');
    expect(await rejection(signTestToken(otherKey, validClaims(NOW), { kid: 'key-1' }))).toBe('INVALID_SIGNATURE');
  });

  it('rejects alg=none and HMAC algorithm confusion', async () => {
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const payload = encode(validClaims(NOW));
    expect(await rejection(`${encode({ alg: 'none', kid: 'key-1' })}.${payload}.AAAA`)).toBe('UNSUPPORTED_ALGORITHM');
    const header = encode({ alg: 'HS256', kid: 'key-1' });
    const secret = key.publicKey.export({ format: 'pem', type: 'spki' });
    const mac = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    expect(await rejection(`${header}.${payload}.${mac}`)).toBe('UNSUPPORTED_ALGORITHM');
  });

  it.each([
    [{ iss: 'https://sts.windows.net/x/' }, 'INVALID_ISSUER'],
    [{ aud: 'outra-api' }, 'INVALID_AUDIENCE'],
    [{ tid: '00000000-0000-4000-8000-000000000000' }, 'INVALID_TENANT'],
    [{ exp: NOW - 61 }, 'EXPIRED'],
    [{ nbf: NOW + 120 }, 'NOT_YET_VALID'],
    [{ iat: NOW + 120 }, 'NOT_YET_VALID'],
    [{ ver: '1.0' }, 'INVALID_VERSION'],
    [{ oid: undefined }, 'MISSING_SUBJECT'],
    [{ oid: 'not-a-guid' }, 'MISSING_SUBJECT'],
    [{ scp: 'User.Read' }, 'INSUFFICIENT_SCOPE'],
    [{ scp: undefined, roles: ['access_as_user'] }, 'INSUFFICIENT_SCOPE'],
    [{ azp: 'f0000000-0000-4000-8000-000000000000' }, 'CLIENT_NOT_ALLOWED'],
    [{ exp: 'tomorrow' }, 'MALFORMED'],
  ])('rejects claims %p with %s', async (overrides, reason) => {
    expect(await rejection(signTestToken(key, validClaims(NOW, overrides as Record<string, unknown>)))).toBe(reason);
  });

  it('tolerates small clock skew', async () => {
    await expect(verifier().verify(signTestToken(key, validClaims(NOW, { exp: NOW - 30 })), NOW_MS)).resolves.toBeDefined();
  });

  it.each([
    ['abc'],
    ['a.b'],
    ['a..c'],
    ['@@@.e30.AAAA'],
    [`${Buffer.from('not json').toString('base64url')}.e30.AAAA`],
    ['x'.repeat(20000)],
  ])('rejects malformed token %#', async (token) => {
    expect(await rejection(token)).toBe('MALFORMED');
  });

  it('rejects critical header extensions and non-JWT types', async () => {
    expect(await rejection(signTestToken(key, validClaims(NOW), { crit: ['exp'] }))).toBe('MALFORMED');
    expect(await rejection(signTestToken(key, validClaims(NOW), { typ: 'at+jwt+other' }))).toBe('MALFORMED');
  });

  it('rejects keys smaller than 2048 bits', async () => {
    const weak = generateTestKey('weak', 1024);
    const instance = verifier({}, { weak: weak.publicKey });
    expect(await rejection(signTestToken(weak, validClaims(NOW)), instance)).toBe('INVALID_SIGNATURE');
  });

  it('requires mandatory options', () => {
    expect(() => verifier({ requiredScope: '' })).toThrow();
  });
});

describe('publicKeyFromJwk', () => {
  it('accepts RSA signature keys only', () => {
    expect(publicKeyFromJwk(key.jwk)).not.toBeNull();
    expect(publicKeyFromJwk({ ...key.jwk, use: 'enc' })).toBeNull();
    expect(publicKeyFromJwk({ ...key.jwk, alg: 'RS512' })).toBeNull();
    expect(publicKeyFromJwk({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' })).toBeNull();
    expect(publicKeyFromJwk({ kty: 'RSA', n: 'invalid', e: 'AQAB' })).toBeNull();
  });
});
