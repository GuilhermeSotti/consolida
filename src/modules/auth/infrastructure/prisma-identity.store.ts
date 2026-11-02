import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../../shared/application/ports';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { IdentityStore, StoredPrincipal, VerifiedIdentity } from '../application/ports';

export const USER_ACCESS_INCLUDE = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} satisfies Prisma.UserInclude;

type UserWithAccess = Prisma.UserGetPayload<{ include: typeof USER_ACCESS_INCLUDE }>;

export function toStoredPrincipal(user: UserWithAccess): StoredPrincipal {
  const roles = user.roles.map((assignment) => assignment.role.code);
  const permissions = new Set<string>();
  for (const assignment of user.roles) {
    for (const grant of assignment.role.permissions) permissions.add(grant.permission.code);
  }
  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    lastSeenAt: user.lastSeenAt,
    roles,
    permissions: [...permissions],
  };
}

@Injectable()
export class PrismaIdentityStore implements IdentityStore {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdentity(provider: string, tenantId: string, subject: string): Promise<StoredPrincipal | null> {
    const identity = await this.prisma.externalIdentity.findUnique({
      where: { provider_tenantId_subject: { provider, tenantId, subject } },
      include: { user: { include: USER_ACCESS_INCLUDE } },
    });
    return identity ? toStoredPrincipal(identity.user) : null;
  }

  async provision(
    identity: VerifiedIdentity,
    displayName: string,
    now: Date,
    onCreated?: (principal: StoredPrincipal, tx: TransactionContext) => Promise<void>,
  ): Promise<{ principal: StoredPrincipal; created: boolean }> {
    try {
      // The unique violation aborts the transaction, so the race is resolved outside of it.
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            displayName,
            email: identity.email ?? null,
            status: 'ACTIVE',
            lastSeenAt: now,
            identities: { create: { provider: identity.provider, tenantId: identity.tenantId, subject: identity.subject } },
          },
          include: USER_ACCESS_INCLUDE,
        });
        const principal = toStoredPrincipal(user);
        await onCreated?.(principal, tx as unknown as TransactionContext);
        return { principal, created: true };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findByIdentity(identity.provider, identity.tenantId, identity.subject);
        if (existing) return { principal: existing, created: false };
      }
      throw error;
    }
  }

  async touch(userId: string, profile: { displayName: string; email: string | null; lastSeenAt: Date }): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: profile, select: { id: true } });
  }
}
