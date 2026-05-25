import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY_TOKEN, IAuthRepository } from '../../domain/repositories/auth.repository';
import { UserSessionEntity } from '../../domain/entities/user-session.entity';

@Injectable()
export class SyncLocalUserUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY_TOKEN)
    private readonly authRepository: IAuthRepository,
  ) {}

  async execute(
    email: string,
    displayName: string,
    entraSub: string,
  ): Promise<UserSessionEntity> {
    // Try to find existing user by email or Entra Sub
    let user = await this.authRepository.findUserByEmail(email);

    if (!user) {
      user = await this.authRepository.findUserByEntraSub(entraSub);
    }

    if (user) {
      // Update existing user
      user = await this.authRepository.updateUser(user.id, {
        entraSub,
        displayName,
      });
    } else {
      // Create new user
      user = await this.authRepository.createUser(email, displayName, entraSub);
    }

    return user;
  }
}
