import type { AuditRecorder } from '../../../shared/application/ports';
import { NotFoundError, UnprocessableError } from '../../../shared/domain/errors';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Row } from '../../../shared/domain/tabular';
import { CSV_BOM, csvHeader, csvLines } from '../domain/csv-export';
import type { ExportedFile, ExportFormat, ReportExportLimits, ReportFilter, ReportsRepository, ReportView, SpreadsheetWriter } from './ports';

const encoder = new TextEncoder();

function exportFileName(report: ReportView, extension: string): string {
  const stamp = (report.availableAt ?? report.createdAt).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `relatorio-consolidado-${report.id.slice(0, 8)}-${stamp}.${extension}`;
}

/** Consultation and export of Consolidated Reports (read-only: reports are never edited). */
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly writer: SpreadsheetWriter,
    private readonly audit: AuditRecorder,
    private readonly limits: ReportExportLimits,
  ) {}

  list(filter: ReportFilter, page: PageRequest): Promise<Page<ReportView>> {
    return this.reports.list(filter, page);
  }

  async get(id: string): Promise<ReportView> {
    const report = await this.reports.findById(id);
    if (!report) throw new NotFoundError('Report', id);
    return report;
  }

  async rows(id: string, page: PageRequest): Promise<Page<Row>> {
    const report = await this.get(id);
    const items = await this.reports.readRows(id, page);
    return { items, page: page.page, pageSize: page.pageSize, totalItems: report.rowCount };
  }

  async export(id: string, format: ExportFormat): Promise<ExportedFile> {
    const report = await this.get(id);
    const cells = report.rowCount * Math.max(report.columns.length, 1);
    if (format === 'xlsx' && cells > this.limits.xlsxMaxCells) {
      // The workbook is assembled in memory and blocks the event loop while it is written; large
      // reports are exported as CSV, which is streamed chunk by chunk.
      throw new UnprocessableError(
        'EXPORT_TOO_LARGE',
        `O relatório tem ${cells} células e a exportação XLSX aceita até ${this.limits.xlsxMaxCells}. Use o formato CSV.`,
      );
    }
    await this.audit.record({
      action: 'REPORT_EXPORTED',
      entityType: 'Report',
      entityId: id,
      outcome: 'SUCCESS',
      details: { format, rowCount: report.rowCount },
    });
    if (format === 'csv') {
      const reports = this.reports;
      async function* csv(): AsyncGenerator<Uint8Array> {
        yield encoder.encode(CSV_BOM + csvHeader(report.columns));
        for await (const rows of reports.streamRows(id)) yield encoder.encode(csvLines(report.columns, rows));
      }
      return { fileName: exportFileName(report, 'csv'), contentType: 'text/csv; charset=utf-8', content: csv() };
    }
    const rows: Row[] = [];
    for await (const chunk of this.reports.streamRows(id)) rows.push(...chunk);
    const workbook = this.writer.writeXlsx('Relatório Consolidado', report.columns, rows);
    async function* single(): AsyncGenerator<Uint8Array> {
      yield workbook;
    }
    return {
      fileName: exportFileName(report, 'xlsx'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: single(),
    };
  }
}
