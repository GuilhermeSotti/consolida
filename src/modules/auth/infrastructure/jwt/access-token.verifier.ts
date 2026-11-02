import { createPublicKey, type KeyObject, verify as verifySignature } from 'node:crypto';

/**
 * Verification of Microsoft Entra ID v2 access tokens (JWS compact, RS256) using only
 * `node:crypto`. Security properties (covered by unit tests):
 *  - only RS256 is accepted (no `none`, no HMAC/alg confusion); `crit` headers are rejected;
 *  - the key is chosen by `kid` exclusively from the configured JWKS (header URLs are ignored);
 *  - `iss`, `aud`, `tid`, `exp`, `nbf`, `iat`, `ver`, `oid` and the delegated scope are checked;
 *  - error messages never echo token content.
 */

export interface SigningKeyResolver {
  /** Returns the RSA public key for `kid`, or null when it is unknown (after any refresh). */
  getSigningKey(kid: string): Promise<KeyObject | null>;
}

export interface AccessTokenVerifierOptions {
  issuer: string;
  audiences: readonly string[];
  tenantId: string;
  /** Delegated scope that must be present in `scp` (e.g. `access_as_user`). */
  requiredScope: string;
  /** Optional allow-list of client applications (`azp`) allowed to call the API. */
  allowedClientIds?: readonly string[];
  clockToleranceSeconds?: number;
  maxTokenLength?: number;
}

export interface VerifiedAccessToken {
  tenantId: string;
  objectId: string;
  name?: string;
  preferredUsername?: string;
  email?: string;
  scopes: string[];
  clientId?: string;
  expiresAt: number;
}

export type TokenRejectionReason =
  | 'MALFORMED'
  | 'UNSUPPORTED_ALGORITHM'
  | 'UNKNOWN_KEY'
  | 'INVALID_SIGNATURE'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'INVALID_TENANT'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'INVALID_VERSION'
  | 'MISSING_SUBJECT'
  | 'INSUFFICIENT_SCOPE'
  | 'CLIENT_NOT_ALLOWED';

export class TokenRejectedError extends Error {
  constructor(readonly reason: TokenRejectionReason) {
    super(`Access token rejected: ${reason}`);
    this.name = 'TokenRejectedError';
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeSegment(segment: string): Buffer {
  if (!BASE64URL.test(segment)) throw new TokenRejectedError('MALFORMED');
  return Buffer.from(segment, 'base64url');
}

function parseJsonObject(segment: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeSegment(segment).toString('utf8'));
  } catch (error) {
    if (error instanceof TokenRejectedError) throw error;
    throw new TokenRejectedError('MALFORMED');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TokenRejectedError('MALFORMED');
  }
  return parsed as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined;
}

export class AccessTokenVerifier {
  private readonly tolerance: number;
  private readonly maxLength: number;

  constructor(
    private readonly options: AccessTokenVerifierOptions,
    private readonly keys: SigningKeyResolver,
  ) {
    if (!options.issuer || options.audiences.length === 0 || !options.tenantId || !options.requiredScope) {
      throw new Error('AccessTokenVerifier requires issuer, audiences, tenantId and requiredScope.');
    }
    this.tolerance = options.clockToleranceSeconds ?? 60;
    this.maxLength = options.maxTokenLength ?? 16 * 1024;
  }

  async verify(token: string, nowMs: number = Date.now()): Promise<VerifiedAccessToken> {
    if (typeof token !== 'string' || token.length === 0 || token.length > this.maxLength) {
      throw new TokenRejectedError('MALFORMED');
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new TokenRejectedError('MALFORMED');
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const header = parseJsonObject(encodedHeader);
    if (header.alg !== 'RS256') throw new TokenRejectedError('UNSUPPORTED_ALGORITHM');
    if (header.crit !== undefined) throw new TokenRejectedError('MALFORMED');
    if (header.typ !== undefined && header.typ !== 'JWT') throw new TokenRejectedError('MALFORMED');
    const kid = header.kid;
    if (typeof kid !== 'string' || kid.length === 0 || kid.length > 256) throw new TokenRejectedError('MALFORMED');

    const key = await this.keys.getSigningKey(kid);
    if (!key) throw new TokenRejectedError('UNKNOWN_KEY');
    const signature = decodeSegment(encodedSignature);
    const modulusBytes = Math.ceil((key.asymmetricKeyDetails?.modulusLength ?? 0) / 8);
    if (key.asymmetricKeyType !== 'rsa' || modulusBytes < 256 || signature.length !== modulusBytes) {
      throw new TokenRejectedError('INVALID_SIGNATURE');
    }
    const signedContent = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii');
    if (!verifySignature('RSA-SHA256', signedContent, key, signature)) throw new TokenRejectedError('INVALID_SIGNATURE');

    const claims = parseJsonObject(encodedPayload);
    return this.validateClaims(claims, Math.floor(nowMs / 1000));
  }

  private validateClaims(claims: Record<string, unknown>, now: number): VerifiedAccessToken {
    if (claims.iss !== this.options.issuer) throw new TokenRejectedError('INVALID_ISSUER');

    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((aud) => typeof aud === 'string' && this.options.audiences.includes(aud))) {
      throw new TokenRejectedError('INVALID_AUDIENCE');
    }
    if (claims.tid !== this.options.tenantId) throw new TokenRejectedError('INVALID_TENANT');

    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) throw new TokenRejectedError('MALFORMED');
    if (now >= claims.exp + this.tolerance) throw new TokenRejectedError('EXPIRED');
    if (claims.nbf !== undefined) {
      if (typeof claims.nbf !== 'number') throw new TokenRejectedError('MALFORMED');
      if (now + this.tolerance < claims.nbf) throw new TokenRejectedError('NOT_YET_VALID');
    }
    if (claims.iat !== undefined) {
      if (typeof claims.iat !== 'number') throw new TokenRejectedError('MALFORMED');
      if (claims.iat > now + this.tolerance) throw new TokenRejectedError('NOT_YET_VALID');
    }
    if (claims.ver !== '2.0') throw new TokenRejectedError('INVALID_VERSION');

    const objectId = claims.oid;
    if (typeof objectId !== 'string' || !GUID.test(objectId)) throw new TokenRejectedError('MISSING_SUBJECT');

    const scopes = typeof claims.scp === 'string' ? claims.scp.split(' ').filter(Boolean) : [];
    if (!scopes.includes(this.options.requiredScope)) throw new TokenRejectedError('INSUFFICIENT_SCOPE');

    const clientId = optionalString(claims.azp);
    if (this.options.allowedClientIds && this.options.allowedClientIds.length > 0) {
      if (!clientId || !this.options.allowedClientIds.includes(clientId.toLowerCase())) {
        throw new TokenRejectedError('CLIENT_NOT_ALLOWED');
      }
    }

    return {
      tenantId: this.options.tenantId,
      objectId: objectId.toLowerCase(),
      name: optionalString(claims.name),
      preferredUsername: optionalString(claims.preferred_username),
      email: optionalString(claims.email),
      scopes,
      clientId,
      expiresAt: claims.exp,
    };
  }
}

/** Converts a JWK (from the tenant JWKS) into a KeyObject, accepting only RSA signature keys. */
export function publicKeyFromJwk(jwk: Record<string, unknown>): KeyObject | null {
  if (jwk.kty !== 'RSA') return null;
  if (jwk.use !== undefined && jwk.use !== 'sig') return null;
  if (jwk.alg !== undefined && jwk.alg !== 'RS256') return null;
  if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') return null;
  try {
    const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    // Node accepts any modulus size; weak keys are discarded before they reach the cache.
    return (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048 ? key : null;
  } catch {
    return null;
  }
}
