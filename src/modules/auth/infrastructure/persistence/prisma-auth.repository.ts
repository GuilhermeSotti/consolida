import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserSessionEntity } from '../../domain/entities/user-session.entity';
import { IAuthRepository } from '../../domain/repositories/auth.repository';
import { v4 as uuid } from 'uuid';

@Injectable()
export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapRoles(roles: Array<{ name: string }>): UserRole[] {
    return roles.map((role) => role.name as UserRole);
  }

  async findUserByEmail(email: string): Promise<UserSessionEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: true,
        permissions: true,
      },
    });

    if (!user) return null;

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      entraSub: user.entraSub,
      roles: this.mapRoles(user.roles),
      permissions: user.permissions.map((p) => `${p.resource}:${p.action}`),
    });
  }

  async findUserByEntraSub(entraSub: string): Promise<UserSessionEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { entraSub },
      include: {
        roles: true,
        permissions: true,
      },
    });

    if (!user) return null;

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      entraSub: user.entraSub,
      roles: this.mapRoles(user.roles),
      permissions: user.permissions.map((p) => `${p.resource}:${p.action}`),
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
        entraSub,
      },
      include: {
        roles: true,
        permissions: true,
      },
    });

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      entraSub: user.entraSub,
      roles: this.mapRoles(user.roles),
      permissions: user.permissions.map((p) => `${p.resource}:${p.action}`),
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
        entraSub: data.entraSub,
      },
      include: {
        roles: true,
        permissions: true,
      },
    });

    return new UserSessionEntity({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      entraSub: user.entraSub,
      roles: this.mapRoles(user.roles),
      permissions: user.permissions.map((p) => `${p.resource}:${p.action}`),
    });
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const roles = await this.prisma.role.findMany({
      where: {
        users: {
          some: { id: userId },
        },
      },
    });

    return roles.map((r) => r.name);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({
      where: {
        users: {
          some: { id: userId },
        },
      },
    });

    return permissions.map((p) => `${p.resource}:${p.action}`);
  }

  async syncUserRoles(userId: string, roles: string[]): Promise<void> {
    // Get or create roles
    const roleIds = [];
    for (const roleName of roles) {
      let role = await this.prisma.role.findUnique({
        where: { name: roleName },
      });

      if (!role) {
        role = await this.prisma.role.create({
          data: {
            id: uuid(),
            name: roleName,
          },
        });
      }

      roleIds.push(role.id);
    }

    // Update user roles
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          set: roleIds.map((id) => ({ id })),
        },
      },
    });
  }

  async syncUserPermissions(
    userId: string,
    permissions: string[],
  ): Promise<void> {
    // Parse permissions (format: "resource:action")
    const permissionIds = [];

    for (const permission of permissions) {
      const [resource, action] = permission.split(':');

      let perm = await this.prisma.permission.findUnique({
        where: {
          resource_action: {
            resource,
            action,
          },
        },
      });

      if (!perm) {
        perm = await this.prisma.permission.create({
          data: {
            id: uuid(),
            resource,
            action,
          },
        });
      }

      permissionIds.push(perm.id);
    }

    // Update user permissions
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        permissions: {
          set: permissionIds.map((id) => ({ id })),
        },
      },
    });
  }
}
