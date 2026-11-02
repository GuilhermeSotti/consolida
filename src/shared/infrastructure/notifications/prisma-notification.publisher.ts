import { Injectable } from '@nestjs/common';
import type { NotificationInput, NotificationPublisher, TransactionContext } from '../../application/ports';
import { db } from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

/** In-app notifications (persisted; delivered by polling the notifications endpoints). */
@Injectable()
export class PrismaNotificationPublisher implements NotificationPublisher {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotificationInput, tx?: TransactionContext): Promise<void> {
    await db(this.prisma, tx).notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 200),
        message: input.message.slice(0, 1000),
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  }
}
