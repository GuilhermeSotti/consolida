import type { RoleView, UserFilter, UsersRepository, UserStatus, UserView } from '../../../src/modules/users/application/ports';
import { UsersService } from '../../../src/modules/users/application/users.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import type { Page, PageRequest } from '../../../src/shared/domain/pagination';
import { failure, FakeAudit, FakeTransactions, principal, uuid } from '../../support/fakes';

class InMemoryUsers implements UsersRepository {
  users = new Map<string, UserView>();
  locks = 0;

  add(id: string, roles: string[], status: UserStatus = 'ACTIVE'): void {
    this.users.set(id, { id, displayName: id, email: null, status, roles, lastSeenAt: null, createdAt: new Date() });
  }
  async list(_filter: UserFilter, page: PageRequest): Promise<Page<UserView>> {
    return { items: [...this.users.values()], page: page.page, pageSize: page.pageSize, totalItems: this.users.size };
  }
  async findById(id: string): Promise<UserView | null> {
    const user = this.users.get(id);
    return user ? { ...user, roles: [...user.roles] } : null;
  }
  async lockAdministration(): Promise<void> {
    this.locks += 1;
  }
  async countActiveAdmins(excludingUserId: string): Promise<number> {
    return [...this.users.values()].filter((u) => u.id !== excludingUserId && u.status === 'ACTIVE' && u.roles.includes('ADMIN')).length;
  }
  async setStatus(id: string, status: UserStatus): Promise<void> {
    this.users.get(id)!.status = status;
  }
  async replaceRoles(id: string, roles: string[]): Promise<void> {
    this.users.get(id)!.roles = roles;
  }
  async listRoles(): Promise<RoleView[]> {
    return [];
  }
}

const ADMIN_ID = uuid(1);
const OTHER_ADMIN_ID = uuid(2);
const ANALYST_ID = uuid(3);

const FUNCTIONAL_ID = uuid(4);

function setup() {
  const users = new InMemoryUsers();
  users.add(ADMIN_ID, ['ADMIN']);
  users.add(ANALYST_ID, ['BUSINESS_ANALYST']);
  users.add(FUNCTIONAL_ID, ['FUNCTIONAL_ADMIN']);
  const audit = new FakeAudit();
  const service = new UsersService(users, new FakeTransactions(), audit);
  return { users, audit, service, admin: principal(['ADMIN'], ADMIN_ID), functional: principal(['FUNCTIONAL_ADMIN'], FUNCTIONAL_ID) };
}

describe('UsersService.setStatus', () => {
  it('deactivates a user under the administration lock and audits it in the transaction', async () => {
    const { service, users, audit, admin } = setup();
    const result = await service.setStatus(admin, ANALYST_ID, 'INACTIVE');
    expect(result.status).toBe('INACTIVE');
    expect(users.locks).toBe(1);
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'USER_DEACTIVATED', entityId: ANALYST_ID, inTransaction: true })]);
  });

  it('is idempotent (no audit when nothing changes)', async () => {
    const { service, audit, admin } = setup();
    await service.setStatus(admin, ANALYST_ID, 'ACTIVE');
    expect(audit.entries).toHaveLength(0);
  });

  it('forbids self-deactivation and lets another administrator deactivate an administrator', async () => {
    const { service, users, admin } = setup();
    expect((await failure(service.setStatus(admin, ADMIN_ID, 'INACTIVE'))).code).toBe('CANNOT_DEACTIVATE_SELF');
    users.add(OTHER_ADMIN_ID, ['ADMIN']);
    await service.setStatus(principal(['ADMIN'], OTHER_ADMIN_ID), ADMIN_ID, 'INACTIVE');
    expect(users.users.get(ADMIN_ID)!.status).toBe('INACTIVE');
  });

  it('keeps the last-administrator guard as defense in depth', async () => {
    const { service, users, admin } = setup();
    users.add(OTHER_ADMIN_ID, ['ADMIN']);
    // Simulates an inconsistent catalog where no other active administrator would remain.
    users.countActiveAdmins = async () => 0;
    const error = await failure(service.setStatus(admin, OTHER_ADMIN_ID, 'INACTIVE'));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe('LAST_ADMIN');
  });

  it('re-reads the acting user under the lock: stale roles and deactivated actors are not trusted', async () => {
    const { service, users } = setup();
    users.add(OTHER_ADMIN_ID, ['ADMIN']);
    users.users.get(ADMIN_ID)!.roles = ['VIEWER']; // demoted after the request started
    const stale = principal(['ADMIN'], ADMIN_ID);
    expect((await failure(service.setStatus(stale, OTHER_ADMIN_ID, 'INACTIVE'))).code).toBe('ADMIN_ROLE_REQUIRED');
    users.users.get(ADMIN_ID)!.status = 'INACTIVE';
    expect((await failure(service.setStatus(stale, ANALYST_ID, 'INACTIVE'))).code).toBe('USER_INACTIVE');
  });

  it('only administrators can change administrator accounts', async () => {
    const { service, functional } = setup();
    const error = await failure(service.setStatus(functional, ADMIN_ID, 'INACTIVE'));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.code).toBe('ADMIN_ROLE_REQUIRED');
  });

  it('returns 404 for unknown users', async () => {
    const { service, admin } = setup();
    expect(await failure(service.setStatus(admin, uuid(77), 'INACTIVE'))).toBeInstanceOf(NotFoundError);
  });
});

describe('UsersService.replaceRoles', () => {
  it('replaces roles and audits previous and next sets', async () => {
    const { service, audit, functional } = setup();
    const result = await service.replaceRoles(functional, ANALYST_ID, ['VIEWER', 'BUSINESS_ANALYST', 'VIEWER']);
    expect(result.roles).toEqual(['BUSINESS_ANALYST', 'VIEWER']);
    expect(audit.entries[0]).toEqual(
      expect.objectContaining({ action: 'USER_ROLES_CHANGED', details: { previous: ['BUSINESS_ANALYST'], next: ['BUSINESS_ANALYST', 'VIEWER'] } }),
    );
  });

  it('prevents privilege escalation: only ADMIN grants ADMIN', async () => {
    const { service, functional, users } = setup();
    const error = await failure(service.replaceRoles(functional, functional.userId === ANALYST_ID ? ADMIN_ID : ANALYST_ID, ['ADMIN']));
    expect(error.code).toBe('ADMIN_ROLE_REQUIRED');
    expect(users.users.get(ANALYST_ID)!.roles).toEqual(['BUSINESS_ANALYST']);
  });

  it('forbids changing the own roles (no self-escalation, no self-removal of ADMIN)', async () => {
    const { service, admin, functional, users } = setup();
    expect((await failure(service.replaceRoles(functional, FUNCTIONAL_ID, ['FUNCTIONAL_ADMIN', 'BUSINESS_ANALYST', 'OPERATIONS']))).code).toBe('CANNOT_CHANGE_OWN_ROLES');
    expect((await failure(service.replaceRoles(admin, ADMIN_ID, ['VIEWER']))).code).toBe('CANNOT_CHANGE_OWN_ROLES');
    expect(users.users.get(FUNCTIONAL_ID)!.roles).toEqual(['FUNCTIONAL_ADMIN']);
    expect(users.locks).toBe(0);
  });

  it('keeps the last-administrator guard when removing ADMIN from another user', async () => {
    const { service, admin, users } = setup();
    users.add(OTHER_ADMIN_ID, ['ADMIN']);
    users.countActiveAdmins = async () => 0;
    expect((await failure(service.replaceRoles(admin, OTHER_ADMIN_ID, ['VIEWER']))).code).toBe('LAST_ADMIN');
  });

  it('allows an administrator to promote another user', async () => {
    const { service, admin } = setup();
    expect((await service.replaceRoles(admin, ANALYST_ID, ['ADMIN'])).roles).toEqual(['ADMIN']);
  });
});
