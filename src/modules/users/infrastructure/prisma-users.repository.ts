import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../../shared/application/ports';
import { Page, PageRequest, toSkipTake } from '../../../shared/domain/pagination';
import { db } from '../../../shared/infrastructure/prisma/prisma-client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ROLES } from '../../auth/domain/access-control';
import type { RoleView, UserFilter, UsersRepository, UserStatus, UserView } from '../application/ports';

const USER_SELECT = {
  id: true,
  displayName: true,
  email: true,
  status: true,
  lastSeenAt: true,
  createdAt: true,
  roles: { select: { role: { select: { code: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toView(row: UserRow): UserView {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    status: row.status,
    roles: row.roles.map((assignment) => assignment.role.code).sort(),
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: UserFilter, page: PageRequest): Promise<Page<UserView>> {
    const where: Prisma.UserWhereInput = {
      status: filter.status,
      roles: filter.role ? { some: { role: { code: filter.role } } } : undefined,
      OR: filter.search
        ? [
            { displayName: { contains: filter.search, mode: 'insensitive' } },
            { email: { contains: filter.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [totalItems, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, select: USER_SELECT, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], ...toSkipTake(page) }),
    ]);
    return { items: rows.map(toView), page: page.page, pageSize: page.pageSize, totalItems };
  }

  async findById(id: string, tx?: TransactionContext): Promise<UserView | null> {
    const row = await db(this.prisma, tx).user.findUnique({ where: { id }, select: USER_SELECT });
    return row ? toView(row) : null;
  }

  async lockAdministration(tx: TransactionContext): Promise<void> {
    // Row lock on the ADMIN role serializes every change that can alter the set of administrators.
    await db(this.prisma, tx).$queryRaw`SELECT id FROM roles WHERE code = ${ROLES.ADMIN} FOR UPDATE`;
  }

  countActiveAdmins(excludingUserId: string, tx: TransactionContext): Promise<number> {
    return db(this.prisma, tx).user.count({
      where: { id: { not: excludingUserId }, status: 'ACTIVE', roles: { some: { role: { code: ROLES.ADMIN } } } },
    });
  }

  async setStatus(id: string, status: UserStatus, tx: TransactionContext): Promise<void> {
    await db(this.prisma, tx).user.update({ where: { id }, data: { status }, select: { id: true } });
  }

  async replaceRoles(id: string, roleCodes: string[], assignedById: string, tx: TransactionContext): Promise<void> {
    const client = db(this.prisma, tx);
    const roles = await client.role.findMany({ where: { code: { in: roleCodes } }, select: { id: true, code: true } });
    if (roles.length !== roleCodes.length) throw new Error('Role catalog is incomplete; run the seed (npm run db:seed).');
    await client.userRole.deleteMany({ where: { userId: id, roleId: { notIn: roles.map((role) => role.id) } } });
    const existing = await client.userRole.findMany({ where: { userId: id }, select: { roleId: true } });
    const missing = roles.filter((role) => !existing.some((assignment) => assignment.roleId === role.id));
    if (missing.length > 0) {
      await client.userRole.createMany({ data: missing.map((role) => ({ userId: id, roleId: role.id, assignedById })) });
    }
  }

  async listRoles(): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, name: true, description: true, permissions: { select: { permission: { select: { code: true } } } } },
    });
    return roles.map((role) => ({
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((grant) => grant.permission.code).sort(),
    }));
  }
}
