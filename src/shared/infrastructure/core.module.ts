import { DynamicModule, Global, Module } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import { systemClock, TOKENS } from '../application/ports';
import { PrismaAuditRecorder } from './audit/prisma-audit.recorder';
import { PrismaJobQueue } from './jobs/prisma-job.queue';
import { PrismaNotificationPublisher } from './notifications/prisma-notification.publisher';
import { PrismaTransactionRunner } from './prisma/prisma-transaction.runner';
import { PrismaService } from './prisma/prisma.service';

/** Process-wide infrastructure shared by the API and the worker (one Prisma client). */
@Global()
@Module({})
export class CoreModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: CoreModule,
      global: true,
      providers: [
        { provide: TOKENS.APP_CONFIG, useValue: config },
        { provide: TOKENS.CLOCK, useValue: systemClock },
        PrismaService,
        { provide: TOKENS.TRANSACTION_RUNNER, useClass: PrismaTransactionRunner },
        { provide: TOKENS.AUDIT_RECORDER, useClass: PrismaAuditRecorder },
        { provide: TOKENS.NOTIFICATION_PUBLISHER, useClass: PrismaNotificationPublisher },
        { provide: TOKENS.JOB_QUEUE, useClass: PrismaJobQueue },
      ],
      exports: [
        TOKENS.APP_CONFIG,
        TOKENS.CLOCK,
        PrismaService,
        TOKENS.TRANSACTION_RUNNER,
        TOKENS.AUDIT_RECORDER,
        TOKENS.NOTIFICATION_PUBLISHER,
        TOKENS.JOB_QUEUE,
      ],
    };
  }
}
