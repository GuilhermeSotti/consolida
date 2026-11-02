import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, PageRequest, toSkipTake } from '../../../shared/domain/pagination';
import type { Row } from '../../../shared/domain/tabular';
import { asRows, chunkRangeForPage } from '../../../shared/infrastructure/prisma/row-chunks';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { parseInputSnapshot } from '../../executions/domain/execution';
import type { ReportFilter, ReportsRepository, ReportView } from '../application/ports';

const REPORT_INCLUDE = {
  execution: { select: { phase: true, requestedById: true, engineVersion: true, reproducedFromId: true, inputSnapshot: true } },
} satisfies Prisma.ReportInclude;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof REPORT_INCLUDE }>;

function toView(row: ReportRow): ReportView {
  const snapshot = parseInputSnapshot(row.execution.inputSnapshot);
  return {
    id: row.id,
    executionId: row.executionId,
    sourceId: row.sourceId,
    name: row.name,
    columns: Array.isArray(row.columns) ? row.columns.map((column) => String(column)) : [],
    rowCount: row.rowCount,
    createdAt: row.createdAt,
    availableAt: row.availableAt,
    execution: {
      phase: row.execution.phase,
      requestedById: row.execution.requestedById,
      engineVersion: row.execution.engineVersion,
      reproducedFromId: row.execution.reproducedFromId,
      primaryImportId: snapshot.primaryImportId,
      rules: snapshot.rules,
    },
  };
}

@Injectable()
export class PrismaReportsRepository implements ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ReportFilter, page: PageRequest): Promise<Page<ReportView>> {
    const where: Prisma.ReportWhereInput = {
      status: 'AVAILABLE',
      sourceId: filter.sourceId,
      executionId: filter.executionId,
      availableAt: filter.from || filter.to ? { gte: filter.from, lt: filter.to } : undefined,
    };
    const [totalItems, rows] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({ where, include: REPORT_INCLUDE, orderBy: [{ availableAt: 'desc' }, { id: 'asc' }], ...toSkipTake(page) }),
    ]);
    return { items: rows.map(toView), page: page.page, pageSize: page.pageSize, totalItems };
  }

  async findById(id: string): Promise<ReportView | null> {
    const row = await this.prisma.report.findFirst({ where: { id, status: 'AVAILABLE' }, include: REPORT_INCLUDE });
    return row ? toView(row) : null;
  }

  async readRows(id: string, page: PageRequest): Promise<Row[]> {
    const range = chunkRangeForPage(page);
    const chunks = await this.prisma.reportChunk.findMany({
      where: { reportId: id, chunkIndex: { gte: range.first, lte: range.last } },
      orderBy: { chunkIndex: 'asc' },
      select: { rows: true },
    });
    return chunks.flatMap((chunk) => asRows(chunk.rows)).slice(range.offset, range.offset + page.pageSize);
  }

  async *streamRows(id: string): AsyncIterable<Row[]> {
    for (let index = 0; ; index += 1) {
      const chunk = await this.prisma.reportChunk.findUnique({
        where: { reportId_chunkIndex: { reportId: id, chunkIndex: index } },
        select: { rows: true },
      });
      if (!chunk) return;
      yield asRows(chunk.rows);
    }
  }
}
