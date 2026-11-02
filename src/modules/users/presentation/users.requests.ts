import { InputValidator, queryObject } from '../../../shared/validation/input';
import type { PageRequest } from '../../../shared/domain/pagination';
import { ROLE_DEFINITIONS } from '../../auth/domain/access-control';
import type { UserFilter, UserStatus } from '../application/ports';

const STATUSES: readonly UserStatus[] = ['ACTIVE', 'INACTIVE'];
const ROLE_CODES = ROLE_DEFINITIONS.map((role) => role.code);

export function parseListUsersQuery(query: unknown): { filter: UserFilter; page: PageRequest } {
  const v = new InputValidator();
  const q = queryObject(v, query, ['status', 'search', 'role']);
  const filter: UserFilter = {
    status: v.enumValue(q.status, 'status', STATUSES),
    search: v.string(q.search, 'search', { max: 100 }),
    role: v.enumValue(q.role, 'role', ROLE_CODES),
  };
  const page = v.page(q);
  v.assert('Parâmetros de consulta inválidos.');
  return { filter, page };
}

export function parseSetUserStatusRequest(body: unknown): UserStatus {
  const v = new InputValidator();
  const o = v.object(body, 'body', ['status']);
  const status = v.enumValue(o.status, 'status', STATUSES, { required: true });
  v.assert();
  return status;
}

export function parseReplaceRolesRequest(body: unknown): string[] {
  const v = new InputValidator();
  const o = v.object(body, 'body', ['roles']);
  const roles = v.array(o.roles, 'roles', { required: true, max: ROLE_CODES.length }, (entry, path) =>
    v.enumValue(entry, path, ROLE_CODES, { required: true }),
  ) ?? [];
  v.assert();
  return roles;
}
