import { NotFoundError } from '../../../shared/domain/errors';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Clock } from '../../../shared/application/ports';

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationsRepository {
  list(userId: string, unreadOnly: boolean, page: PageRequest): Promise<Page<NotificationView>>;
  /** Marks as read only when the notification belongs to `userId`. */
  markRead(userId: string, id: string, readAt: Date): Promise<NotificationView | null>;
  markAllRead(userId: string, readAt: Date): Promise<number>;
}

export const NOTIFICATIONS_REPOSITORY = 'NotificationsRepository';

/** In-app notifications. Every operation is scoped to the authenticated user (object-level authorization). */
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly clock: Clock,
  ) {}

  list(userId: string, unreadOnly: boolean, page: PageRequest): Promise<Page<NotificationView>> {
    return this.notifications.list(userId, unreadOnly, page);
  }

  async markRead(userId: string, id: string): Promise<NotificationView> {
    const updated = await this.notifications.markRead(userId, id, this.clock.now());
    // Another user's notification is reported as not found (no information disclosure).
    if (!updated) throw new NotFoundError('Notification', id);
    return updated;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(userId, this.clock.now()) };
  }
}
