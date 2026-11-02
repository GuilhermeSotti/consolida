import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import { UnauthenticatedError } from '../../../shared/domain/errors';
import type { TokenVerifier, VerifiedIdentity } from '../application/ports';
import { AccessTokenVerifier, TokenRejectedError } from './jwt/access-token.verifier';
import { JwksClient } from './jwt/jwks.client';

/**
 * Adapter between the application port and the Entra ID v2 access-token verifier.
 * The rejection reason is logged (without the token) and the client receives a generic 401.
 */
export class EntraTokenVerifier implements TokenVerifier {
  private readonly logger = new Logger('Authentication');

  constructor(private readonly verifier: AccessTokenVerifier) {}

  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const verified = await this.verifier.verify(token);
      const username = verified.preferredUsername;
      return {
        provider: 'entra-id',
        tenantId: verified.tenantId,
        subject: verified.objectId,
        displayName: verified.name ?? username,
        email: verified.email ?? (username && username.includes('@') ? username : undefined),
      };
    } catch (error) {
      if (error instanceof TokenRejectedError) {
        this.logger.warn({ event: 'access_token_rejected', reason: error.reason });
        throw new UnauthenticatedError('INVALID_TOKEN', 'Token de acesso inválido ou expirado.');
      }
      throw error;
    }
  }
}

export function createEntraTokenVerifier(config: AppConfig): EntraTokenVerifier {
  const logger = new Logger('Authentication');
  const jwks = new JwksClient({
    jwksUri: config.entra.jwksUri,
    onRefreshError: (error) =>
      logger.error({ event: 'jwks_refresh_failed', error: error instanceof Error ? error.message : String(error) }),
  });
  return new EntraTokenVerifier(
    new AccessTokenVerifier(
      {
        issuer: config.entra.issuer,
        audiences: config.entra.audiences,
        tenantId: config.entra.tenantId,
        requiredScope: config.entra.requiredScope,
        allowedClientIds: config.entra.allowedClientIds,
      },
      jwks,
    ),
  );
}
