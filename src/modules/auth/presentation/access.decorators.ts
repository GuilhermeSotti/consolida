import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { UnauthenticatedError } from '../../../shared/domain/errors';
import type { PermissionCode, Principal } from '../domain/access-control';

export const ACCESS_POLICY_KEY = 'consolidahub:access-policy';

/**
 * Every route must declare exactly one access policy; routes without one are denied
 * (deny-by-default, enforced by AuthorizationGuard and by the route inventory test).
 */
export type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: PermissionCode[] };

/** No authentication (health probes only). */
export const Public = () => SetMetadata(ACCESS_POLICY_KEY, { kind: 'public' } satisfies AccessPolicy);

/** Any authenticated and active user (own profile, own notifications). */
export const AuthenticatedOnly = () => SetMetadata(ACCESS_POLICY_KEY, { kind: 'authenticated' } satisfies AccessPolicy);

/** Requires ALL listed permissions, resolved from the database for the current user. */
export const RequirePermissions = (...permissions: [PermissionCode, ...PermissionCode[]]) =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'permissions', permissions } satisfies AccessPolicy);

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): Principal => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.principal) throw new UnauthenticatedError('MISSING_TOKEN', 'Token de acesso ausente.');
  return request.principal;
});
