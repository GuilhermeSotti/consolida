import { Module } from '@nestjs/common';
import { TOKENS, type Clock } from '../../shared/application/ports';
import { NOTIFICATIONS_REPOSITORY, NotificationsService, type NotificationsRepository } from './application/notifications.service';
import { PrismaNotificationsRepository } from './infrastructure/prisma-notifications.repository';
import { NotificationsController } from './presentation/notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATIONS_REPOSITORY, useClass: PrismaNotificationsRepository },
    {
      provide: NotificationsService,
      useFactory: (repository: NotificationsRepository, clock: Clock) => new NotificationsService(repository, clock),
      inject: [NOTIFICATIONS_REPOSITORY, TOKENS.CLOCK],
    },
  ],
})
export class NotificationsModule {}
