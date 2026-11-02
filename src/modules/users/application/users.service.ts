import type { AuditRecorder, TransactionContext, TransactionRunner } from '../../../shared/application/ports';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import { Principal, ROLES } from '../../auth/domain/access-control';
import type { RoleView, UserFilter, UsersRepository, UserStatus, UserView } from './ports';

const ADMIN = ROLES.ADMIN;

/**
 * User and role administration. Safeguards:
 *  * nobody changes their own roles (prevents self-escalation, e.g. FUNCTIONAL_ADMIN granting
 *    itself business roles) nor deactivates themselves;
 *  * only ADMIN users can grant/revoke ADMIN or change accounts that hold ADMIN;
 *  * the acting user's status and roles are re-read under the administration lock, so a
 *    demotion committed while the request was in flight is honoured;
 *  * the last active administrator can never be removed or deactivated (defense in depth: with
 *    the rules above an active ADMIN actor always remains).
 */
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly transactions: TransactionRunner,
    private readonly audit: AuditRecorder,
  ) {}

  list(filter: UserFilter, page: PageRequest): Promise<Page<UserView>> {
    return this.users.list(filter, page);
  }

  async get(id: string): Promise<UserView> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  listRoles(): Promise<RoleView[]> {
    return this.users.listRoles();
  }

  async setStatus(actor: Principal, id: string, status: UserStatus): Promise<UserView> {
    if (id === actor.userId && status === 'INACTIVE') {
      throw new ConflictError('CANNOT_DEACTIVATE_SELF', 'Você não pode desativar o próprio usuário.');
    }
    return this.transactions.run(async (tx) => {
      await this.users.lockAdministration(tx);
      const actorRoles = await this.currentRoles(actor, tx);
      const user = await this.users.findById(id, tx);
      if (!user) throw new NotFoundError('User', id);
      this.assertCanManage(actorRoles, user);
      if (user.status === status) return user;
      if (status === 'INACTIVE' && user.roles.includes(ADMIN) && (await this.users.countActiveAdmins(id, tx)) === 0) {
        throw new ConflictError('LAST_ADMIN', 'Não é possível desativar o último administrador ativo.');
      }
      await this.users.setStatus(id, status, tx);
      await this.audit.record(
        {
          action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          entityType: 'User',
          entityId: id,
          outcome: 'SUCCESS',
          details: { previousStatus: user.status, status },
        },
        tx,
      );
      return { ...user, status };
    });
  }

  async replaceRoles(actor: Principal, id: string, roles: string[]): Promise<UserView> {
    if (id === actor.userId) {
      throw new ConflictError('CANNOT_CHANGE_OWN_ROLES', 'Você não pode alterar os próprios papéis. Peça a outro administrador.');
    }
    const next = [...new Set(roles)].sort();
    return this.transactions.run(async (tx) => {
      await this.users.lockAdministration(tx);
      const actorRoles = await this.currentRoles(actor, tx);
      const user = await this.users.findById(id, tx);
      if (!user) throw new NotFoundError('User', id);
      const previous = [...user.roles].sort();
      const grantsOrRevokesAdmin = previous.includes(ADMIN) !== next.includes(ADMIN);
      if (grantsOrRevokesAdmin && !actorRoles.includes(ADMIN)) {
        throw new ForbiddenError('ADMIN_ROLE_REQUIRED', 'Somente administradores podem conceder ou remover o papel ADMIN.');
      }
      this.assertCanManage(actorRoles, user);
      if (previous.includes(ADMIN) && !next.includes(ADMIN) && user.status === 'ACTIVE' && (await this.users.countActiveAdmins(id, tx)) === 0) {
        throw new ConflictError('LAST_ADMIN', 'Não é possível remover o último administrador ativo.');
      }
      if (previous.join(',') === next.join(',')) return user;
      await this.users.replaceRoles(id, next, actor.userId, tx);
      await this.audit.record(
        { action: 'USER_ROLES_CHANGED', entityType: 'User', entityId: id, outcome: 'SUCCESS', details: { previous, next } },
        tx,
      );
      return { ...user, roles: next };
    });
  }

  /** Roles of the acting user as committed now (not as loaded at the start of the request). */
  private async currentRoles(actor: Principal, tx: TransactionContext): Promise<string[]> {
    const current = await this.users.findById(actor.userId, tx);
    if (!current || current.status !== 'ACTIVE') {
      throw new ForbiddenError('USER_INACTIVE', 'Usuário desativado. Procure o administrador do ConsolidaHub.');
    }
    return current.roles;
  }

  private assertCanManage(actorRoles: readonly string[], target: UserView): void {
    if (target.roles.includes(ADMIN) && !actorRoles.includes(ADMIN)) {
      throw new ForbiddenError('ADMIN_ROLE_REQUIRED', 'Somente administradores podem alterar contas de administradores.');
    }
  }
}
