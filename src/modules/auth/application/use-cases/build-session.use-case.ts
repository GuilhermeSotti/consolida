import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY_TOKEN, IAuthRepository } from '../../domain/repositories/auth.repository';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserSessionEntity } from '../../domain/entities/user-session.entity';

@Injectable()
export class BuildSessionUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY_TOKEN)
    private readonly authRepository: IAuthRepository,
  ) {}

  async execute(userId: string): Promise<UserSessionEntity> {
    // Load user with full context (roles and permissions)
    const user = await this.authRepository.findUserByEmail(
      userId, // In a real scenario, you'd query by ID
    );

    if (!user) {
      throw new Error('User not found');
    }

    // Load fresh roles and permissions
    const roles = await this.authRepository.getUserRoles(user.id);
    const permissions = await this.authRepository.getUserPermissions(user.id);

    return new UserSessionEntity({
      ...user,
      roles: roles as unknown as UserRole[],
      permissions,
    });
  }
}
