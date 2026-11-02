import { Injectable } from '@nestjs/common';
import type { AuditEntry, AuditRecorder, TransactionContext } from '../../application/ports';
import { RequestContext } from '../context/request-context';
import { redact } from '../logging/redact';
import { db, json } from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Appends audit events (the table rejects UPDATE/DELETE via trigger). When called with a
 * transaction, the event commits or rolls back together with the audited change.
 */
@Injectable()
export class PrismaAuditRecorder implements AuditRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: TransactionContext): Promise<void> {
    const context = RequestContext.current();
    await db(this.prisma, tx).auditEvent.create({
      data: {
        action: entry.action.slice(0, 100),
        entityType: entry.entityType.slice(0, 50),
        entityId: entry.entityId ?? null,
        outcome: entry.outcome,
        actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : (context?.userId ?? null),
        requestId: context?.requestId ?? null,
        ipAddress: context?.ipAddress?.slice(0, 45) ?? null,
        userAgent: context?.userAgent?.slice(0, 512) ?? null,
        details: entry.details ? json(redact(entry.details)) : undefined,
      },
    });
  }
}
