import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TOKENS, type AuditRecorder } from '../../../shared/application/ports';
import { ForbiddenError, UnauthenticatedError } from '../../../shared/domain/errors';
import { hasAllPermissions } from '../domain/access-control';
import { ACCESS_POLICY_KEY, AccessPolicy, AuthenticatedRequest } from './access.decorators';

/**
 * Global guard #2: enforces the route access policy with permissions loaded from the database.
 * Routes without a declared policy are denied. Denials are audited.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger('Authorization');

  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKENS.AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const route = `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? request.path}`;
    if (!policy) {
      this.logger.error({ event: 'route_without_access_policy', route });
      throw new ForbiddenError('ACCESS_POLICY_MISSING', 'Acesso negado.');
    }
    if (policy.kind === 'public') return true;
    const principal = request.principal;
    if (!principal) throw new UnauthenticatedError('MISSING_TOKEN', 'Token de acesso ausente.');
    if (policy.kind === 'authenticated' || hasAllPermissions(principal, policy.permissions)) return true;

    try {
      await this.audit.record({
        action: 'ACCESS_DENIED',
        entityType: 'Route',
        outcome: 'DENIED',
        details: { route, required: policy.permissions },
      });
    } catch (error) {
      this.logger.error({ event: 'audit_write_failed', error: error instanceof Error ? error.message : String(error) });
    }
    throw new ForbiddenError('INSUFFICIENT_PERMISSIONS', 'Você não tem permissão para esta operação.');
  }
}
