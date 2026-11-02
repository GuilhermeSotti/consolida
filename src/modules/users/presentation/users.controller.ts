import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { PERMISSIONS, Principal } from '../../auth/domain/access-control';
import { CurrentPrincipal, RequirePermissions } from '../../auth/presentation/access.decorators';
import { PaginatedResult } from '../../../shared/presentation/http/api-response';
import type { RoleView, UserView } from '../application/ports';
import { UsersService } from '../application/users.service';
import { parseListUsersQuery, parseReplaceRolesRequest, parseSetUserStatusRequest } from './users.requests';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  async list(@Query() query: Record<string, unknown>): Promise<PaginatedResult<UserView>> {
    const { filter, page } = parseListUsersQuery(query);
    return new PaginatedResult(await this.users.list(filter, page));
  }

  @Get(':userId')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  get(@Param('userId', new ParseUUIDPipe()) userId: string): Promise<UserView> {
    return this.users.get(userId);
  }

  @Patch(':userId/status')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  setStatus(@CurrentPrincipal() actor: Principal, @Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: unknown): Promise<UserView> {
    return this.users.setStatus(actor, userId, parseSetUserStatusRequest(body));
  }

  @Put(':userId/roles')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  replaceRoles(@CurrentPrincipal() actor: Principal, @Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: unknown): Promise<UserView> {
    return this.users.replaceRoles(actor, userId, parseReplaceRolesRequest(body));
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  list(): Promise<RoleView[]> {
    return this.users.listRoles();
  }
}
