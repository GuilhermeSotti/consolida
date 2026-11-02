import { Module } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import { TOKENS, type AuditRecorder, type Clock } from '../../shared/application/ports';
import { AuthenticationService } from './application/authentication.service';
import { AUTH_TOKENS, type IdentityStore, type TokenVerifier } from './application/ports';
import { createEntraTokenVerifier } from './infrastructure/entra-token.verifier';
import { PrismaIdentityStore } from './infrastructure/prisma-identity.store';
import { AuthController } from './presentation/auth.controller';
import { AuthenticationGuard } from './presentation/authentication.guard';
import { AuthorizationGuard } from './presentation/authorization.guard';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_TOKENS.IDENTITY_STORE, useClass: PrismaIdentityStore },
    { provide: AUTH_TOKENS.TOKEN_VERIFIER, useFactory: (config: AppConfig) => createEntraTokenVerifier(config), inject: [TOKENS.APP_CONFIG] },
    {
      provide: AuthenticationService,
      useFactory: (verifier: TokenVerifier, identities: IdentityStore, audit: AuditRecorder, clock: Clock) =>
        new AuthenticationService(verifier, identities, audit, clock),
      inject: [AUTH_TOKENS.TOKEN_VERIFIER, AUTH_TOKENS.IDENTITY_STORE, TOKENS.AUDIT_RECORDER, TOKENS.CLOCK],
    },
    AuthenticationGuard,
    AuthorizationGuard,
  ],
  exports: [AuthenticationService, AuthenticationGuard, AuthorizationGuard],
})
export class AuthModule {}
