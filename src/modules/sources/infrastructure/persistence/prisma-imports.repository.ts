import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../../../shared/application/ports';
import { ConflictError, type ErrorDetail } from '../../../../shared/domain/errors';
import { Page, PageRequest, toSkipTake } from '../../../../shared/domain/pagination';
import type { Row } from '../../../../shared/domain/tabular';
import { db, json } from '../../../../shared/infrastructure/prisma/prisma-client';
import { asRows, CHUNK_INSERT_BATCH, chunkRangeForPage, splitIntoChunks } from '../../../../shared/infrastructure/prisma/row-chunks';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { ImportsRepository, ImportStatus, ImportView, NewImport } from '../../application/ports';
import type { ImportedColumn } from '../../domain/tabular-import';

const IMPORT_SELECT = {
  id: true,
  sourceId: true,
  status: true,
  fileName: true,
  fileFormat: true,
  fileSizeBytes: true,
  checksumSha256: true,
  rowCount: true,
  columns: true,
  validationErrors: true,
  errorMessage: true,
  uploadedById: true,
  createdAt: true,
  processedAt: true,
} satisfies Prisma.DataImportSelect;

type ImportRow = Prisma.DataImportGetPayload<{ select: typeof IMPORT_SELECT }>;

function toView(row: ImportRow): ImportView {
  return {
    ...row,
    columns: Array.isArray(row.columns) ? (row.columns as unknown as ImportedColumn[]) : null,
    validationErrors: Array.isArray(row.validationErrors) ? (row.validationErrors as unknown as ErrorDetail[]) : null,
  };
}

@Injectable()
export class PrismaImportsRepository implements ImportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(sourceId: string, status: ImportStatus | undefined, page: PageRequest): Promise<Page<ImportView>> {
    const where: Prisma.DataImportWhereInput = { sourceId, status };
    const [totalItems, rows] = await Promise.all([
      this.prisma.dataImport.count({ where }),
      this.prisma.dataImport.findMany({ where, select: IMPORT_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...toSkipTake(page) }),
    ]);
    return { items: rows.map(toView), page: page.page, pageSize: page.pageSize, totalItems };
  }

  async findById(id: string, tx?: TransactionContext): Promise<ImportView | null> {
    const row = await db(this.prisma, tx).dataImport.findUnique({ where: { id }, select: IMPORT_SELECT });
    return row ? toView(row) : null;
  }

  async lockSourceForUpload(sourceId: string, tx: TransactionContext): Promise<void> {
    await db(this.prisma, tx).$queryRaw`SELECT id FROM sources WHERE id = ${sourceId}::uuid FOR UPDATE`;
  }

  async findLiveDuplicate(sourceId: string, checksumSha256: string, tx?: TransactionContext): Promise<ImportView | null> {
    const row = await db(this.prisma, tx).dataImport.findFirst({
      where: { sourceId, checksumSha256, status: { in: ['RECEIVED', 'PROCESSING', 'VALIDATED'] } },
      select: IMPORT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return row ? toView(row) : null;
  }

  async create(input: NewImport, tx: TransactionContext): Promise<ImportView> {
    const row = await db(this.prisma, tx).dataImport.create({
      data: {
        sourceId: input.sourceId,
        status: 'RECEIVED',
        fileName: input.fileName,
        fileFormat: input.fileFormat,
        fileSizeBytes: input.fileSizeBytes,
        checksumSha256: input.checksumSha256,
        uploadedById: input.uploadedById,
        file: { create: { content: Buffer.from(input.content) } },
      },
      select: IMPORT_SELECT,
    });
    return toView(row);
  }

  async readRows(importId: string, page: PageRequest): Promise<Row[]> {
    const range = chunkRangeForPage(page);
    const chunks = await this.prisma.importChunk.findMany({
      where: { importId, chunkIndex: { gte: range.first, lte: range.last } },
      orderBy: { chunkIndex: 'asc' },
      select: { rows: true },
    });
    return chunks.flatMap((chunk) => asRows(chunk.rows)).slice(range.offset, range.offset + page.pageSize);
  }

  async readContent(importId: string): Promise<Uint8Array | null> {
    const file = await this.prisma.importFile.findUnique({ where: { importId }, select: { content: true } });
    return file ? new Uint8Array(file.content) : null;
  }

  async markProcessing(importId: string): Promise<boolean> {
    const result = await this.prisma.dataImport.updateMany({
      where: { id: importId, status: { in: ['RECEIVED', 'PROCESSING'] } },
      data: { status: 'PROCESSING' },
    });
    return result.count > 0;
  }

  async saveValidated(importId: string, result: { columns: ImportedColumn[]; rows: Row[]; processedAt: Date }, tx: TransactionContext): Promise<void> {
    const client = db(this.prisma, tx);
    await client.importChunk.deleteMany({ where: { importId } });
    const chunks = splitIntoChunks(result.rows);
    for (let start = 0; start < chunks.length; start += CHUNK_INSERT_BATCH) {
      await client.importChunk.createMany({
        data: chunks.slice(start, start + CHUNK_INSERT_BATCH).map((rows, offset) => ({ importId, chunkIndex: start + offset, rows: json(rows) })),
      });
    }
    const updated = await client.dataImport.updateMany({
      where: { id: importId, status: 'PROCESSING' },
      data: {
        status: 'VALIDATED',
        rowCount: result.rows.length,
        columns: json(result.columns),
        validationErrors: Prisma.DbNull,
        errorMessage: null,
        processedAt: result.processedAt,
      },
    });
    if (updated.count !== 1) throw new ConflictError('IMPORT_STATE_CHANGED', 'A carga mudou de estado durante o processamento.');
  }

  async saveRejected(importId: string, issues: ErrorDetail[], processedAt: Date, tx: TransactionContext): Promise<void> {
    await db(this.prisma, tx).dataImport.updateMany({
      where: { id: importId, status: { in: ['RECEIVED', 'PROCESSING'] } },
      data: { status: 'REJECTED', validationErrors: json(issues.slice(0, 100)), processedAt },
    });
  }

  async saveFailed(importId: string, message: string, processedAt: Date, tx: TransactionContext): Promise<void> {
    await db(this.prisma, tx).dataImport.updateMany({
      where: { id: importId, status: { in: ['RECEIVED', 'PROCESSING'] } },
      data: { status: 'FAILED', errorMessage: message.slice(0, 1000), processedAt },
    });
  }
}
