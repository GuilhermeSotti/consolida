import { Controller, Get, Header, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { Row } from '../../../shared/domain/tabular';
import { RequestContext } from '../../../shared/infrastructure/context/request-context';
import { PaginatedResult } from '../../../shared/presentation/http/api-response';
import { abortOnStreamError } from '../../../shared/presentation/http/streaming';
import { parsePageQuery } from '../../../shared/validation/input';
import { PERMISSIONS } from '../../auth/domain/access-control';
import { RequirePermissions } from '../../auth/presentation/access.decorators';
import type { ReportView } from '../application/ports';
import { ReportsService } from '../application/reports.service';
import { parseExportQuery, parseListReportsQuery } from './reports.requests';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async list(@Query() query: Record<string, unknown>): Promise<PaginatedResult<ReportView>> {
    const { filter, page } = parseListReportsQuery(query);
    return new PaginatedResult(await this.reports.list(filter, page));
  }

  @Get(':reportId')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  get(@Param('reportId', new ParseUUIDPipe()) reportId: string): Promise<ReportView> {
    return this.reports.get(reportId);
  }

  @Get(':reportId/rows')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async rows(@Param('reportId', new ParseUUIDPipe()) reportId: string, @Query() query: Record<string, unknown>): Promise<PaginatedResult<Row>> {
    return new PaginatedResult(await this.reports.rows(reportId, parsePageQuery(query)));
  }

  /** Download (CSV with ";" + UTF-8 BOM for Excel pt-BR, or XLSX). Not cached by intermediaries. */
  @Get(':reportId/export')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  async export(@Param('reportId', new ParseUUIDPipe()) reportId: string, @Query() query: Record<string, unknown>): Promise<StreamableFile> {
    const file = await this.reports.export(reportId, parseExportQuery(query));
    const stream = new StreamableFile(Readable.from(file.content), {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
    return abortOnStreamError(stream, RequestContext.current()?.requestId);
  }
}
