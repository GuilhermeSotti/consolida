import { Controller, Get, Query } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/presentation/http/api-response';
import { PERMISSIONS } from '../../auth/domain/access-control';
import { RequirePermissions } from '../../auth/presentation/access.decorators';
import { AuditQueryService, type AuditEventView } from '../application/audit-query.service';
import { parseListAuditQuery } from './audit.requests';

@Controller('audit-events')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  async list(@Query() query: Record<string, unknown>): Promise<PaginatedResult<AuditEventView>> {
    const { filter, page } = parseListAuditQuery(query);
    return new PaginatedResult(await this.audit.list(filter, page));
  }
}
