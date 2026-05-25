import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EntraTokenClaims {
  sub: string;
  email: string;
  preferred_username: string;
  given_name?: string;
  family_name?: string;
  oid: string;
  appid: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

@Injectable()
export class EntraTokenValidatorProvider {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Validates an Entra ID token.
   * In production, you would use a JWT verification library
   * and validate against the JWKS endpoint.
   */
  async validateToken(token: string): Promise<EntraTokenClaims> {
    try {
      // TODO: Implement actual JWT validation
      // For now, this is a placeholder
      // In production, use:
      // - jsonwebtoken library with JWKS
      // - node-jose for key management
      // - microsoft identity platform JWKS endpoint

      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8'),
      ) as Partial<EntraTokenClaims>;

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }

      // Validate issuer and audience
      const expectedIssuer = this.configService.get('ENTRA_ISSUER');
      const expectedAudience = this.configService.get('ENTRA_CLIENT_ID');

      if (expectedIssuer && payload.iss !== expectedIssuer) {
        throw new Error('Invalid issuer');
      }

      if (expectedAudience && payload.aud !== expectedAudience) {
        throw new Error('Invalid audience');
      }

      return payload as EntraTokenClaims;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new UnauthorizedException(
        `Token validation failed: ${message}`,
      );
    }
  }

  /**
   * Fetches the JWKS (JSON Web Key Set) from the Entra ID endpoint
   */
  async getJwks(jwksUri: string): Promise<Record<string, unknown>> {
    try {
      // TODO: Implement JWKS fetch and caching
      // In production, use a library like node-jose
      const response = await fetch(jwksUri);
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      throw new UnauthorizedException(
        `Failed to fetch JWKS: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
