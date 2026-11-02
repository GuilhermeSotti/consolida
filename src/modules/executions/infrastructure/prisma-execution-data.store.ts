import { Injectable } from '@nestjs/common';
import type { TransactionContext } from '../../../shared/application/ports';
import type { Dataset } from '../../../shared/domain/tabular';
import { db, json } from '../../../shared/infrastructure/prisma/prisma-client';
import { asRows, CHUNK_INSERT_BATCH, splitIntoChunks } from '../../../shared/infrastructure/prisma/row-chunks';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { ExecutionDataStore, ImportRef } from '../application/ports';

@Injectable()
export class PrismaExecutionDataStore implements ExecutionDataStore {
  constructor(private readonly prisma: PrismaService) {}

  latestValidatedImport(sourceId: string): Promise<ImportRef | null> {
    return this.prisma.dataImport.findFirst({
      where: { sourceId, status: 'VALIDATED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, sourceId: true, status: true },
    });
  }

  findImport(importId: string): Promise<ImportRef | null> {
    return this.prisma.dataImport.findUnique({ where: { id: importId }, select: { id: true, sourceId: true, status: true } });
  }

  async loadImportDataset(importId: string): Promise<Dataset> {
    const found = await this.prisma.dataImport.findUnique({ where: { id: importId }, select: { columns: true, rowCount: true } });
    if (!found || !Array.isArray(found.columns)) throw new Error(`Import ${importId} has no column metadata.`);
    const columns = (found.columns as Array<{ name?: unknown }>).map((column) => String(column.name));
    const chunks = await this.prisma.importChunk.findMany({ where: { importId }, orderBy: { chunkIndex: 'asc' }, select: { rows: true } });
    const rows = chunks.flatMap((chunk) => asRows(chunk.rows));
    if (found.rowCount !== null && rows.length !== found.rowCount) {
      throw new Error(`Import ${importId} is inconsistent: expected ${found.rowCount} rows, found ${rows.length}.`);
    }
    return { columns, rows };
  }

  async writeReport(
    input: { executionId: string; sourceId: string; name: string; dataset: Dataset; availableAt: Date },
    tx: TransactionContext,
  ): Promise<string> {
    const client = db(this.prisma, tx);
    const report = await client.report.create({
      data: {
        executionId: input.executionId,
        sourceId: input.sourceId,
        name: input.name.slice(0, 255),
        status: 'GENERATING',
        columns: json(input.dataset.columns),
        rowCount: input.dataset.rows.length,
      },
      select: { id: true },
    });
    const chunks = splitIntoChunks(input.dataset.rows);
    for (let start = 0; start < chunks.length; start += CHUNK_INSERT_BATCH) {
      await client.reportChunk.createMany({
        data: chunks.slice(start, start + CHUNK_INSERT_BATCH).map((rows, offset) => ({ reportId: report.id, chunkIndex: start + offset, rows: json(rows) })),
      });
    }
    await client.report.update({ where: { id: report.id }, data: { status: 'AVAILABLE', availableAt: input.availableAt }, select: { id: true } });
    return report.id;
  }
}
