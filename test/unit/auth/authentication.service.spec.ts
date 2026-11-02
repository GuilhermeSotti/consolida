import { AuthenticationService, extractBearerToken } from '../../../src/modules/auth/application/authentication.service';
import type { IdentityStore, StoredPrincipal, TokenVerifier, VerifiedIdentity } from '../../../src/modules/auth/application/ports';
import { ForbiddenError, UnauthenticatedError } from '../../../src/shared/domain/errors';
import type { TransactionContext } from '../../../src/shared/application/ports';
import { failure, FakeAudit, FixedClock, TX, uuid } from '../../support/fakes';

const TOKEN = 'aaa.bbb.ccc';
const identity: VerifiedIdentity = { provider: 'entra-id', tenantId: uuid(1), subject: uuid(2), displayName: 'Maria', email: 'maria@empresa.com' };

class Verifier implements TokenVerifier {
  calls: string[] = [];
  constructor(private readonly result: VerifiedIdentity | Error = identity) {}
  async verify(token: string): Promise<VerifiedIdentity> {
    this.calls.push(token);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class Store implements IdentityStore {
  users = new Map<string, StoredPrincipal>();
  touched: Array<{ userId: string; displayName: string; email: string | null }> = [];
  provisionRace = false;

  async findByIdentity(provider: string, tenantId: string, subject: string): Promise<StoredPrincipal | null> {
    return this.users.get(`${provider}|${tenantId}|${subject}`) ?? null;
  }

  async provision(found: VerifiedIdentity, displayName: string, now: Date, onCreated?: (principal: StoredPrincipal, tx: TransactionContext) => Promise<void>) {
    const principal: StoredPrincipal = { userId: uuid(10), displayName, email: found.email ?? null, status: 'ACTIVE', lastSeenAt: now, roles: [], permissions: [] };
    this.users.set(`${found.provider}|${found.tenantId}|${found.subject}`, principal);
    if (!this.provisionRace) await onCreated?.(principal, TX);
    return { principal, created: !this.provisionRace };
  }

  async touch(userId: string, profile: { displayName: string; email: string | null; lastSeenAt: Date }): Promise<void> {
    this.touched.push({ userId, displayName: profile.displayName, email: profile.email });
  }
}

function setup(verifier = new Verifier()) {
  const store = new Store();
  const audit = new FakeAudit();
  const clock = new FixedClock();
  return { store, audit, clock, verifier, service: new AuthenticationService(verifier, store, audit, clock) };
}

describe('extractBearerToken', () => {
  it('accepts only "Bearer <jwt>"', () => {
    expect(extractBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(() => extractBearerToken(undefined)).toThrow(UnauthenticatedError);
    expect(() => extractBearerToken(`Basic ${TOKEN}`)).toThrow('inválido');
    expect(() => extractBearerToken(`Bearer ${TOKEN} extra`)).toThrow('inválido');
    expect(() => extractBearerToken(['Bearer a.b.c'])).toThrow(UnauthenticatedError);
  });
});

describe('AuthenticationService', () => {
  it('provisions a new user without roles on first access and audits it', async () => {
    const { service, audit, verifier } = setup();
    const result = await service.authenticate(`Bearer ${TOKEN}`);
    expect(verifier.calls).toEqual([TOKEN]);
    expect(result).toEqual({ userId: uuid(10), displayName: 'Maria', email: 'maria@empresa.com', roles: [], permissions: [] });
    expect(audit.actions()).toEqual(['USER_PROVISIONED']);
    expect(audit.entries[0].actorUserId).toBe(uuid(10));
    // Recorded in the same transaction that creates the user.
    expect(audit.entries[0].inTransaction).toBe(true);
  });

  it('does not audit when a concurrent request provisioned the same identity', async () => {
    const { service, audit, store } = setup();
    store.provisionRace = true;
    await service.authenticate(`Bearer ${TOKEN}`);
    expect(audit.entries).toHaveLength(0);
  });

  it('uses roles and permissions from the store, never from the token', async () => {
    const { service, store, clock } = setup();
    store.users.set(`entra-id|${uuid(1)}|${uuid(2)}`, {
      userId: uuid(11),
      displayName: 'Maria',
      email: 'maria@empresa.com',
      status: 'ACTIVE',
      lastSeenAt: clock.now(),
      roles: ['VIEWER'],
      permissions: ['rules:view', 'reports:view'],
    });
    const result = await service.authenticate(`Bearer ${TOKEN}`);
    expect(result.roles).toEqual(['VIEWER']);
    expect(result.permissions).toEqual(['reports:view', 'rules:view']);
  });

  it('refreshes profile data when it changed or was not seen recently', async () => {
    const { service, store, clock } = setup();
    store.users.set(`entra-id|${uuid(1)}|${uuid(2)}`, {
      userId: uuid(11), displayName: 'Nome Antigo', email: null, status: 'ACTIVE', lastSeenAt: clock.now(), roles: [], permissions: [],
    });
    await service.authenticate(`Bearer ${TOKEN}`);
    expect(store.touched).toEqual([{ userId: uuid(11), displayName: 'Maria', email: 'maria@empresa.com' }]);
  });

  it('rejects deactivated users with 403', async () => {
    const { service, store, clock } = setup();
    store.users.set(`entra-id|${uuid(1)}|${uuid(2)}`, {
      userId: uuid(11), displayName: 'Maria', email: 'maria@empresa.com', status: 'INACTIVE', lastSeenAt: clock.now(), roles: ['ADMIN'], permissions: ['users:manage'],
    });
    const error = await failure(service.authenticate(`Bearer ${TOKEN}`));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.code).toBe('USER_INACTIVE');
  });

  it('propagates token verification failures and never touches the store', async () => {
    const { service, store } = setup(new Verifier(new UnauthenticatedError('INVALID_TOKEN')));
    const error = await failure(service.authenticate(`Bearer ${TOKEN}`));
    expect(error.code).toBe('INVALID_TOKEN');
    expect(store.users.size).toBe(0);
  });
});
