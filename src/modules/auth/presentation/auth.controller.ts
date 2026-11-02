import { Controller, Get } from '@nestjs/common';
import type { Principal } from '../domain/access-control';
import { AuthenticatedOnly, CurrentPrincipal } from './access.decorators';

@Controller('auth')
export class AuthController {
  /** Local profile, roles and effective permissions of the caller (used by the web app). */
  @Get('me')
  @AuthenticatedOnly()
  me(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }
}
