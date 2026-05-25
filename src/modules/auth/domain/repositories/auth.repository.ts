import { UserSessionEntity } from '../entities/user-session.entity';

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<UserSessionEntity | null>;
  findUserByEntraSub(entraSub: string): Promise<UserSessionEntity | null>;
  createUser(email: string, displayName: string, entraSub: string): Promise<UserSessionEntity>;
  updateUser(id: string, data: Partial<UserSessionEntity>): Promise<UserSessionEntity>;
  getUserRoles(userId: string): Promise<string[]>;
  getUserPermissions(userId: string): Promise<string[]>;
  syncUserRoles(userId: string, roles: string[]): Promise<void>;
  syncUserPermissions(userId: string, permissions: string[]): Promise<void>;
}

export const AUTH_REPOSITORY_TOKEN = 'IAuthRepository';
