import { Module } from '@nestjs/common';
import { AUDIT_EVENTS_REPOSITORY, AuditQueryService, type AuditEventsRepository } from './application/audit-query.service';
import { PrismaAuditEventsRepository } from './infrastructure/prisma-audit-events.repository';
import { AuditController } from './presentation/audit.controller';

@Module({
  controllers: [AuditController],
  providers: [
    { provide: AUDIT_EVENTS_REPOSITORY, useClass: PrismaAuditEventsRepository },
    { provide: AuditQueryService, useFactory: (events: AuditEventsRepository) => new AuditQueryService(events), inject: [AUDIT_EVENTS_REPOSITORY] },
  ],
})
export class AuditModule {}
