import type { Page, PageRequest } from '../../../shared/domain/pagination';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditEventView {
  id: string;
  occurredAt: Date;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AuditOutcome;
  requestId: string | null;
  ipAddress: string | null;
  details: unknown;
}

export interface AuditFilter {
  actorUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
}

export interface AuditEventsRepository {
  list(filter: AuditFilter, page: PageRequest): Promise<Page<AuditEventView>>;
}

export const AUDIT_EVENTS_REPOSITORY = 'AuditEventsRepository';

/** Read-only access to the append-only audit trail. */
export class AuditQueryService {
  constructor(private readonly events: AuditEventsRepository) {}

  list(filter: AuditFilter, page: PageRequest): Promise<Page<AuditEventView>> {
    return this.events.list(filter, page);
  }
}
