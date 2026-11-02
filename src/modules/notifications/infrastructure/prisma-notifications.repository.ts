import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, PageRequest, toSkipTake } from '../../../shared/domain/pagination';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { NotificationsRepository, NotificationView } from '../application/notifications.service';

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, unreadOnly: boolean, page: PageRequest): Promise<Page<NotificationView>> {
    const where: Prisma.NotificationWhereInput = { userId, readAt: unreadOnly ? null : undefined };
    const [totalItems, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({ where, select: NOTIFICATION_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...toSkipTake(page) }),
    ]);
    return { items, page: page.page, pageSize: page.pageSize, totalItems };
  }

  async markRead(userId: string, id: string, readAt: Date): Promise<NotificationView | null> {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt } });
    return this.prisma.notification.findFirst({ where: { id, userId }, select: NOTIFICATION_SELECT });
  }

  async markAllRead(userId: string, readAt: Date): Promise<number> {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt } });
    return result.count;
  }
}
