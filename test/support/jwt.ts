import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';

/** Test-only helpers to mint RS256 tokens signed by locally generated keys (never used in src). */
export interface TestKeyPair {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  jwk: Record<string, unknown>;
}

export function generateTestKey(kid: string, modulusLength = 2048): TestKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  return { kid, privateKey, publicKey, jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' } };
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signTestToken(
  key: TestKeyPair,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
): string {
  const encodedHeader = encode({ alg: 'RS256', typ: 'JWT', kid: key.kid, ...header });
  const encodedPayload = encode(claims);
  const signature = sign('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), key.privateKey);
  return `${encodedHeader}.${encodedPayload}.${signature.toString('base64url')}`;
}

export const TEST_TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';
export const TEST_API_CLIENT_ID = 'd3b07384-d9a0-4c9b-8f1e-1234567890ab';
export const TEST_SPA_CLIENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const TEST_ISSUER = `https://login.microsoftonline.com/${TEST_TENANT}/v2.0`;

export function validClaims(nowSeconds: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: TEST_ISSUER,
    aud: TEST_API_CLIENT_ID,
    tid: TEST_TENANT,
    oid: '0f0e0d0c-0b0a-4908-8706-050403020100',
    azp: TEST_SPA_CLIENT_ID,
    scp: 'access_as_user',
    ver: '2.0',
    name: 'Maria Analista',
    preferred_username: 'maria@empresa.com',
    iat: nowSeconds - 10,
    nbf: nowSeconds - 10,
    exp: nowSeconds + 3600,
    ...overrides,
  };
}
