import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/presentation/http/api-response';
import { InputValidator, queryObject } from '../../../shared/validation/input';
import type { Principal } from '../../auth/domain/access-control';
import { AuthenticatedOnly, CurrentPrincipal } from '../../auth/presentation/access.decorators';
import { NotificationsService, type NotificationView } from '../application/notifications.service';

@Controller('notifications')
@AuthenticatedOnly()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal, @Query() query: Record<string, unknown>): Promise<PaginatedResult<NotificationView>> {
    const v = new InputValidator();
    const q = queryObject(v, query, ['unreadOnly']);
    const unreadOnly = v.boolean(q.unreadOnly, 'unreadOnly', { coerce: true }) ?? false;
    const page = v.page(q);
    v.assert('Parâmetros de consulta inválidos.');
    return new PaginatedResult(await this.notifications.list(principal.userId, unreadOnly, page));
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentPrincipal() principal: Principal): Promise<{ updated: number }> {
    return this.notifications.markAllRead(principal.userId);
  }

  @Post(':notificationId/read')
  @HttpCode(200)
  markRead(@CurrentPrincipal() principal: Principal, @Param('notificationId', new ParseUUIDPipe()) notificationId: string): Promise<NotificationView> {
    return this.notifications.markRead(principal.userId, notificationId);
  }
}
