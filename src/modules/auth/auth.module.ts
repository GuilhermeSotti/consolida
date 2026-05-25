import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Application
import { ValidateEntraTokenUseCase } from './application/use-cases/validate-entra-token.use-case';
import { SyncLocalUserUseCase } from './application/use-cases/sync-local-user.use-case';
import { BuildSessionUseCase } from './application/use-cases/build-session.use-case';

// Infrastructure
import { EntraTokenValidatorProvider } from './infrastructure/providers/entra-token-validator.provider';
import { PrismaAuthRepository } from './infrastructure/persistence/prisma-auth.repository';
import { AUTH_REPOSITORY_TOKEN } from './domain/repositories/auth.repository';

// Presentation
import { AuthController } from './presentation/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';
import { PermissionsGuard } from './presentation/guards/permissions.guard';

// Shared
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    // Use Cases
    ValidateEntraTokenUseCase,
    SyncLocalUserUseCase,
    BuildSessionUseCase,

    // Infrastructure
    EntraTokenValidatorProvider,
    {
      provide: AUTH_REPOSITORY_TOKEN,
      useClass: PrismaAuthRepository,
    },

    // Guards
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,

    // Shared
    PrismaService,
  ],
  exports: [
    ValidateEntraTokenUseCase,
    SyncLocalUserUseCase,
    BuildSessionUseCase,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    AUTH_REPOSITORY_TOKEN,
  ],
})
export class AuthModule {}
