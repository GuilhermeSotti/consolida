export type AuditStatus = 'SUCCESS' | 'FAILURE';

export type AuditInput = {
  action: string;
  entity: string;
  entityId?: string;
  status: AuditStatus;
  durationMs?: number;
  metadata?: unknown;
};
