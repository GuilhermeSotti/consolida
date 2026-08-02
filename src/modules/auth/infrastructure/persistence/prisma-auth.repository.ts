import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserSessionEntity } from '../../domain/entities/user-session.entity';
import { IAuthRepository } from '../../domain/repositories/auth.repository';
import { v4 as uuid } from 'uuid';

@Injectable()
export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapRoles(roles: Array<unknown> | undefined): UserRole[] {
    if (!roles) {
      return [];
    }

    return roles
      .map((role) => {
        const asAny = role as { role?: { name?: string }; name?: string };
        return asAny.role?.name ?? asAny.name ?? '';
      })
      .filter((name) => Boolean(name))
      .map((name) => name as UserRole);
  }

  async findUserByEmail(email: string): Promise<UserSessionEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: true,
      },
    });

    if (!user) return null;

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName || '',
      entraSub: '', // TODO: Map from ExternalIdentity relation
      roles: this.mapRoles(user.roles),
      permissions: [], // TODO: Get from role permissions
    });
  }

  async findUserByEntraSub(entraSub: string): Promise<UserSessionEntity | null> {
    // TODO: Query via ExternalIdentity relation

    const user = await this.prisma.user.findFirst({
      where: {
        identities: {
          some: {
            provider: 'entra',
            subject: entraSub,
          },
        },
      },
      include: {
        roles: true,
      },
    });

    if (!user) return null;

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName || '',
      entraSub: '',
      roles: this.mapRoles(user.roles),
      permissions: [],
    });
  }

  async createUser(
    email: string,
    displayName: string,
    entraSub: string,
  ): Promise<UserSessionEntity> {
    const user = await this.prisma.user.create({
      data: {
        id: uuid(),
        email,
        displayName,
      },
      include: {
        roles: true,
      },
    });

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName || '',
      entraSub: entraSub,
      roles: this.mapRoles(user.roles),
      permissions: [], // TODO: Get from role permissions
    });
  }

  async updateUser(
    id: string,
    data: Partial<UserSessionEntity>,
  ): Promise<UserSessionEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        displayName: data.displayName,
      },
      include: {
        roles: true,
      },
    });

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName || '',
      entraSub: data.entraSub || '',
      roles: this.mapRoles(user.roles),
      permissions: [], // TODO: Get from role permissions
    });
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId: userId,
      },
      include: {
        role: true,
      },
    });

    return roles.map((r) => r.role.name);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    return userRoles.flatMap((entry) => entry.role.permissions.map((link) => link.permission.name));
  }

  async syncUserRoles(userId: string, roles: string[]): Promise<void> {
    // Get or create roles
    const roleIds: string[] = [];
    for (const roleName of roles) {
      let role = await this.prisma.role.findFirst({
        where: { OR: [{ code: roleName }, { name: roleName }] },
      });

      if (!role) {
        role = await this.prisma.role.create({
          data: {
            id: uuid(),
            code: roleName.toLowerCase().replace(/\s+/g, '-'),
            name: roleName,
          },
        });
      }

      roleIds.push(role.id);
    }

    // Update user roles
    await this.prisma.userRole.deleteMany({
      where: { userId },
    });

    await this.prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId })),
    });
  }

  async syncUserPermissions(
    userId: string,
    permissions: string[],
  ): Promise<void> {
    // Parse permissions (format: "resource:action")
    const permissionIds: string[] = [];

    for (const permission of permissions) {
      const [resource, action] = permission.split(':');

      let perm = await this.prisma.permission.findFirst({
        where: {
          OR: [{ code: `${resource}:${action}` }, { name: `${resource}:${action}` }],
        },
      });

      if (!perm) {
        perm = await this.prisma.permission.create({
          data: {
            id: uuid(),
            code: `${resource}:${action}`,
            name: `${resource}:${action}`,
          },
        });
      }

      permissionIds.push(perm.id);
    }

    // Permissions are modeled through role assignment in this schema.
    await Promise.resolve(permissionIds);
  }
}
