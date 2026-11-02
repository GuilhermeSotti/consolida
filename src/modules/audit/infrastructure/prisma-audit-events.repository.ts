import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, PageRequest, toSkipTake } from '../../../shared/domain/pagination';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { AuditEventsRepository, AuditEventView, AuditFilter } from '../application/audit-query.service';

@Injectable()
export class PrismaAuditEventsRepository implements AuditEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AuditFilter, page: PageRequest): Promise<Page<AuditEventView>> {
    const where: Prisma.AuditEventWhereInput = {
      actorUserId: filter.actorUserId,
      action: filter.action,
      entityType: filter.entityType,
      entityId: filter.entityId,
      outcome: filter.outcome,
      occurredAt: filter.from || filter.to ? { gte: filter.from, lt: filter.to } : undefined,
    };
    const [totalItems, items] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        select: {
          id: true,
          occurredAt: true,
          actorUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          outcome: true,
          requestId: true,
          ipAddress: true,
          details: true,
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(page),
      }),
    ]);
    return { items, page: page.page, pageSize: page.pageSize, totalItems };
  }
}
