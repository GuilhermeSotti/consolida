import type { TransactionContext } from '../../../shared/application/ports';
import type { Page, PageRequest } from '../../../shared/domain/pagination';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface UserView {
  id: string;
  displayName: string;
  email: string | null;
  status: UserStatus;
  roles: string[];
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface UserFilter {
  status?: UserStatus;
  search?: string;
  role?: string;
}

export interface RoleView {
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface UsersRepository {
  list(filter: UserFilter, page: PageRequest): Promise<Page<UserView>>;
  findById(id: string, tx?: TransactionContext): Promise<UserView | null>;
  /** Serializes changes that may affect the set of active administrators. */
  lockAdministration(tx: TransactionContext): Promise<void>;
  countActiveAdmins(excludingUserId: string, tx: TransactionContext): Promise<number>;
  setStatus(id: string, status: UserStatus, tx: TransactionContext): Promise<void>;
  replaceRoles(id: string, roleCodes: string[], assignedById: string, tx: TransactionContext): Promise<void>;
  listRoles(): Promise<RoleView[]>;
}

export const USERS_REPOSITORY = 'UsersRepository';
