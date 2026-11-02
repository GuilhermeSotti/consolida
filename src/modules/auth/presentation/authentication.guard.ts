import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../../../shared/infrastructure/context/request-context';
import { AuthenticationService } from '../application/authentication.service';
import { ACCESS_POLICY_KEY, AccessPolicy, AuthenticatedRequest } from './access.decorators';

/** Global guard #1 (after rate limiting): authenticates every non-public route. */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuthenticationService) private readonly authentication: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return false;
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY_KEY, [context.getHandler(), context.getClass()]);
    if (policy?.kind === 'public') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.authentication.authenticate(request.headers.authorization);
    request.principal = principal;
    RequestContext.setUser(principal.userId);
    return true;
  }
}
