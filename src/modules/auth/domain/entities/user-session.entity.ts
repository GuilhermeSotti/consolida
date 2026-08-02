import { UserRole } from '../enums/user-role.enum';

export class UserSessionEntity {
  id!: string;
  email!: string;
  displayName!: string;
  entraSub!: string;
  roles!: UserRole[];
  permissions!: string[];

  constructor(data: Partial<UserSessionEntity>) {
    Object.assign(this, data);
  }

  hasRole(role: UserRole): boolean {
    return this.roles?.includes(role) ?? false;
  }

  hasRoles(...roles: UserRole[]): boolean {
    return roles.some(role => this.hasRole(role));
  }

  hasPermission(permission: string): boolean {
    return this.permissions?.includes(permission) ?? false;
  }

  hasPermissions(...permissions: string[]): boolean {
    return permissions.every(permission => this.hasPermission(permission));
  }

  hasAnyPermission(...permissions: string[]): boolean {
    return permissions.some(permission => this.hasPermission(permission));
  }
}
