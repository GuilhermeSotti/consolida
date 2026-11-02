import { Injectable } from '@nestjs/common';
import { Prisma, type Source } from '@prisma/client';
import type { TransactionContext } from '../../../../shared/application/ports';
import { ConflictError } from '../../../../shared/domain/errors';
import { Page, PageRequest, toSkipTake } from '../../../../shared/domain/pagination';
import { db, isUniqueViolation, json } from '../../../../shared/infrastructure/prisma/prisma-client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { CreateSourceCommand, SourceFilter, SourcesRepository, SourceView, UpdateSourceCommand } from '../../application/ports';
import { parseSourceMetadata, type SourceStatus } from '../../domain/source';
import { parseExpectedColumns } from '../../domain/tabular-import';

function toView(row: Source): SourceView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    origin: row.origin,
    fileFormat: row.fileFormat,
    sheetName: row.sheetName,
    csvDelimiter: row.csvDelimiter,
    expectedColumns: parseExpectedColumns(row.expectedColumns).columns,
    metadata: parseSourceMetadata(row.metadata).metadata,
    status: row.status,
    createdById: row.createdById,
    updatedById: row.updatedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaSourcesRepository implements SourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: SourceFilter, page: PageRequest): Promise<Page<SourceView>> {
    const where: Prisma.SourceWhereInput = {
      status: filter.status,
      fileFormat: filter.fileFormat,
      OR: filter.search
        ? [
            { code: { contains: filter.search, mode: 'insensitive' } },
            { name: { contains: filter.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [totalItems, rows] = await Promise.all([
      this.prisma.source.count({ where }),
      this.prisma.source.findMany({ where, orderBy: [{ code: 'asc' }], ...toSkipTake(page) }),
    ]);
    return { items: rows.map(toView), page: page.page, pageSize: page.pageSize, totalItems };
  }

  async findById(id: string, tx?: TransactionContext): Promise<SourceView | null> {
    const row = await db(this.prisma, tx).source.findUnique({ where: { id } });
    return row ? toView(row) : null;
  }

  async existingIds(ids: readonly string[], tx?: TransactionContext): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db(this.prisma, tx).source.findMany({ where: { id: { in: [...ids] } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async create(command: CreateSourceCommand, createdById: string, tx: TransactionContext): Promise<SourceView> {
    try {
      const row = await db(this.prisma, tx).source.create({
        data: {
          code: command.code,
          name: command.name,
          description: command.description,
          origin: 'FILE_UPLOAD',
          fileFormat: command.fileFormat,
          sheetName: command.sheetName,
          csvDelimiter: command.csvDelimiter,
          expectedColumns: json(command.expectedColumns),
          metadata: json(command.metadata),
          createdById,
        },
      });
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('SOURCE_CODE_TAKEN', `Já existe uma fonte com o código ${command.code}.`);
      throw error;
    }
  }

  async update(id: string, changes: UpdateSourceCommand, updatedById: string, tx: TransactionContext): Promise<SourceView> {
    const row = await db(this.prisma, tx).source.update({
      where: { id },
      data: {
        name: changes.name,
        description: changes.description,
        sheetName: changes.sheetName,
        csvDelimiter: changes.csvDelimiter,
        expectedColumns: changes.expectedColumns ? json(changes.expectedColumns) : undefined,
        metadata: changes.metadata ? json(changes.metadata) : undefined,
        updatedById,
      },
    });
    return toView(row);
  }

  async setStatus(id: string, status: SourceStatus, updatedById: string, tx: TransactionContext): Promise<SourceView> {
    const row = await db(this.prisma, tx).source.update({ where: { id }, data: { status, updatedById } });
    return toView(row);
  }
}
