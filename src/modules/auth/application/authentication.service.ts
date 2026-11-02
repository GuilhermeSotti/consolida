import { ForbiddenError, UnauthenticatedError } from '../../../shared/domain/errors';
import type { AuditRecorder, Clock } from '../../../shared/application/ports';
import type { Principal } from '../domain/access-control';
import type { IdentityStore, TokenVerifier } from './ports';

const PROFILE_REFRESH_MS = 5 * 60 * 1000;

/** Extracts the token from `Authorization: Bearer <token>` (single header, single scheme). */
export function extractBearerToken(header: unknown): string {
  if (typeof header !== 'string' || header.length === 0) {
    throw new UnauthenticatedError('MISSING_TOKEN', 'Token de acesso ausente.');
  }
  const match = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/.exec(header);
  if (!match) throw new UnauthenticatedError('INVALID_TOKEN', 'Token de acesso inválido ou expirado.');
  return match[1];
}

/**
 * Turns a bearer token into the local Principal:
 *  1. the token is verified cryptographically (TokenVerifier);
 *  2. the local user is found by the immutable identity (provider, tid, oid) — never by e-mail;
 *  3. first access provisions the user WITHOUT roles (an administrator grants access);
 *  4. roles and permissions always come from the database, never from token claims;
 *  5. deactivated users are refused.
 */
export class AuthenticationService {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly identities: IdentityStore,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async authenticate(authorizationHeader: unknown): Promise<Principal> {
    const token = extractBearerToken(authorizationHeader);
    const identity = await this.verifier.verify(token);
    const now = this.clock.now();
    const displayName = (identity.displayName ?? identity.email ?? 'Usuário').slice(0, 255);
    const email = identity.email ? identity.email.slice(0, 320) : null;

    let stored = await this.identities.findByIdentity(identity.provider, identity.tenantId, identity.subject);
    if (!stored) {
      const provisioned = await this.identities.provision(identity, displayName, now, (principal, tx) =>
        this.audit.record(
          {
            action: 'USER_PROVISIONED',
            entityType: 'User',
            entityId: principal.userId,
            outcome: 'SUCCESS',
            actorUserId: principal.userId,
            details: { provider: identity.provider, tenantId: identity.tenantId },
          },
          tx,
        ),
      );
      stored = provisioned.principal;
    } else if (
      stored.displayName !== displayName ||
      stored.email !== email ||
      !stored.lastSeenAt ||
      now.getTime() - stored.lastSeenAt.getTime() > PROFILE_REFRESH_MS
    ) {
      await this.identities.touch(stored.userId, { displayName, email, lastSeenAt: now });
      stored = { ...stored, displayName, email, lastSeenAt: now };
    }

    if (stored.status !== 'ACTIVE') {
      throw new ForbiddenError('USER_INACTIVE', 'Usuário desativado. Procure o administrador do ConsolidaHub.');
    }
    return {
      userId: stored.userId,
      displayName: stored.displayName,
      email: stored.email,
      roles: [...stored.roles].sort(),
      permissions: [...stored.permissions].sort(),
    };
  }
}
