import { SetMetadata } from '@nestjs/common';

export const AUDIT_EVENT_KEY = 'audit_event';

export type AuditEventMeta = {
  action: string;
  entity: string;
};

export const AuditEvent = (meta: AuditEventMeta) =>
  SetMetadata(AUDIT_EVENT_KEY, meta);
