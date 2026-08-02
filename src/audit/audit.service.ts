import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { RequestContextService } from '../observability/request-context.service';
import { AuditInput } from './audit.types';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async record(input: AuditInput): Promise<void> {
    const ctx = this.context.get();

    try {
      await this.prisma.auditLog.create({
        data: {
          requestId: ctx?.requestId,
          traceId: ctx?.traceId,
          spanId: ctx?.spanId,
          actorUserId: ctx?.userId,
          actorEmail: ctx?.email,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          status: input.status,
          durationMs: input.durationMs,
          ipAddress: ctx?.ip,
          userAgent: ctx?.userAgent,
          metadata: (input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : { source: 'ui' }) as never,
        },
      });
    } catch (error) {
      // Falha silenciosa em auditoria para não quebrar fluxo
      console.error('Failed to record audit log:', error);
    }
  }
}
