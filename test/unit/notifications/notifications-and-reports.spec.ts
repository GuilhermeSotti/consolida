import { NotificationsService, type NotificationsRepository, type NotificationView } from '../../../src/modules/notifications/application/notifications.service';
import type { ReportsRepository, ReportView, SpreadsheetWriter } from '../../../src/modules/reports/application/ports';
import { ReportsService } from '../../../src/modules/reports/application/reports.service';
import { NotFoundError, UnprocessableError } from '../../../src/shared/domain/errors';
import type { Row } from '../../../src/shared/domain/tabular';
import { failure, FakeAudit, FixedClock, uuid } from '../../support/fakes';

describe('NotificationsService', () => {
  const OWNER = uuid(1);
  const notification: NotificationView = {
    id: uuid(10), type: 'EXECUTION_SUCCEEDED', title: 't', message: 'm', entityType: null, entityId: null, readAt: null, createdAt: new Date(),
  };
  const repository: NotificationsRepository = {
    list: async (_user, _unread, page) => ({ items: [notification], page: page.page, pageSize: page.pageSize, totalItems: 1 }),
    markRead: async (userId, id, readAt) => (userId === OWNER && id === notification.id ? { ...notification, readAt } : null),
    markAllRead: async () => 3,
  };
  const service = new NotificationsService(repository, new FixedClock());

  it('marks only the caller own notification and hides others as not found', async () => {
    expect((await service.markRead(OWNER, notification.id)).readAt).toEqual(new Date('2026-10-23T12:00:00.000Z'));
    expect(await failure(service.markRead(uuid(2), notification.id))).toBeInstanceOf(NotFoundError);
    expect(await service.markAllRead(OWNER)).toEqual({ updated: 3 });
  });
});

describe('ReportsService', () => {
  const report: ReportView = {
    id: uuid(20),
    executionId: uuid(21),
    sourceId: uuid(22),
    name: 'Relatório',
    columns: ['NF', 'OBS'],
    rowCount: 3,
    createdAt: new Date('2026-10-23T10:00:00Z'),
    availableAt: new Date('2026-10-23T10:05:00Z'),
    execution: { phase: null, requestedById: uuid(1), engineVersion: '1.0.0', reproducedFromId: null, primaryImportId: uuid(23), rules: [] },
  };
  const chunks: Row[][] = [[{ NF: '1', OBS: '=HYPERLINK("x")' }, { NF: '2', OBS: 'a;b' }], [{ NF: '3', OBS: null }]];
  const repository: ReportsRepository = {
    list: async (_f, page) => ({ items: [report], page: page.page, pageSize: page.pageSize, totalItems: 1 }),
    findById: async (id) => (id === report.id ? report : null),
    readRows: async () => chunks.flat(),
    async *streamRows() {
      for (const chunk of chunks) yield chunk;
    },
  };
  const writer: SpreadsheetWriter = { writeXlsx: (_name, columns, rows) => new TextEncoder().encode(`${columns.length}x${rows.length}`) };

  async function collect(stream: AsyncIterable<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
    let text = '';
    for await (const part of stream) text += decoder.decode(part, { stream: true });
    return text;
  }

  it('streams CSV with BOM, ";" separator and formula neutralization, and audits the export', async () => {
    const audit = new FakeAudit();
    const service = new ReportsService(repository, writer, audit, { xlsxMaxCells: 1000 });
    const file = await service.export(report.id, 'csv');
    expect(file.fileName).toBe(`relatorio-consolidado-${report.id.slice(0, 8)}-202610231005.csv`);
    expect(await collect(file.content)).toBe('﻿NF;OBS\r\n1;"\'=HYPERLINK(""x"")"\r\n2;"a;b"\r\n3;\r\n');
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'REPORT_EXPORTED', entityId: report.id, details: { format: 'csv', rowCount: 3 } })]);
  });

  it('builds XLSX through the writer port and 404s for unknown reports', async () => {
    const service = new ReportsService(repository, writer, new FakeAudit(), { xlsxMaxCells: 1000 });
    expect(await collect((await service.export(report.id, 'xlsx')).content)).toBe('2x3');
    expect(await failure(service.export(uuid(99), 'csv'))).toBeInstanceOf(NotFoundError);
  });

  it('refuses XLSX above the cell limit (built in memory) without auditing, while CSV still streams', async () => {
    const audit = new FakeAudit();
    const service = new ReportsService(repository, writer, audit, { xlsxMaxCells: 5 });
    const error = await failure(service.export(report.id, 'xlsx'));
    expect(error).toBeInstanceOf(UnprocessableError);
    expect((error as UnprocessableError).code).toBe('EXPORT_TOO_LARGE');
    expect(audit.entries).toEqual([]);
    expect(await collect((await service.export(report.id, 'csv')).content)).toContain('3;\r\n');
  });
});
