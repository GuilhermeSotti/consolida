import type { TransactionContext } from '../../../shared/application/ports';

/** Identity proven by a cryptographically verified access token. */
export interface VerifiedIdentity {
  provider: 'entra-id';
  tenantId: string;
  /** Immutable object id (`oid`) of the user in the tenant. */
  subject: string;
  displayName?: string;
  /** Informational only — never used to link identities. */
  email?: string;
}

export interface TokenVerifier {
  /** Throws UnauthenticatedError when the token is not acceptable. */
  verify(token: string): Promise<VerifiedIdentity>;
}

export interface StoredPrincipal {
  userId: string;
  displayName: string;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  lastSeenAt: Date | null;
  roles: string[];
  permissions: string[];
}

export interface IdentityStore {
  findByIdentity(provider: string, tenantId: string, subject: string): Promise<StoredPrincipal | null>;
  /**
   * Creates the local user and its external identity atomically, running `onCreated` (e.g. the
   * audit record) in the SAME transaction. When another request provisioned the same identity
   * concurrently, returns that user instead (`created: false`, `onCreated` not called).
   */
  provision(
    identity: VerifiedIdentity,
    displayName: string,
    now: Date,
    onCreated?: (principal: StoredPrincipal, tx: TransactionContext) => Promise<void>,
  ): Promise<{ principal: StoredPrincipal; created: boolean }>;
  touch(userId: string, profile: { displayName: string; email: string | null; lastSeenAt: Date }): Promise<void>;
}

export const AUTH_TOKENS = {
  TOKEN_VERIFIER: 'TokenVerifier',
  IDENTITY_STORE: 'IdentityStore',
} as const;
