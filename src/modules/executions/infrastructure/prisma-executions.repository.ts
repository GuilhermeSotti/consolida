import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../../shared/application/ports';
import { Page, PageRequest, toSkipTake } from '../../../shared/domain/pagination';
import { db, isUniqueViolation, json } from '../../../shared/infrastructure/prisma/prisma-client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { redact } from '../../../shared/infrastructure/logging/redact';
import {
  DuplicateIdempotencyKeyError,
  type ExecutionFilter,
  type ExecutionLogView,
  type ExecutionsRepository,
  type ExecutionView,
  type LogEntry,
  type NewExecution,
} from '../application/ports';
import { parseInputSnapshot, type ExecutionProgress, type ExecutionStatus } from '../domain/execution';

const EXECUTION_INCLUDE = { report: { select: { id: true, status: true } } } satisfies Prisma.ExecutionInclude;
type ExecutionRow = Prisma.ExecutionGetPayload<{ include: typeof EXECUTION_INCLUDE }>;

function toProgress(value: Prisma.JsonValue): ExecutionProgress | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.stage === 'string' && typeof record.rulesApplied === 'number' && typeof record.totalRules === 'number'
    ? (record as unknown as ExecutionProgress)
    : null;
}

function toView(row: ExecutionRow): ExecutionView {
  return {
    id: row.id,
    sourceId: row.sourceId,
    status: row.status,
    phase: row.phase,
    requestedById: row.requestedById,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    engineVersion: row.engineVersion,
    inputSnapshot: parseInputSnapshot(row.inputSnapshot),
    reproducedFromId: row.reproducedFromId,
    cancelRequested: row.cancelRequested,
    rowsIn: row.rowsIn,
    rowsOut: row.rowsOut,
    progress: toProgress(row.progress),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    reportId: row.report && row.report.status === 'AVAILABLE' ? row.report.id : null,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

@Injectable()
export class PrismaExecutionsRepository implements ExecutionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ExecutionFilter, page: PageRequest): Promise<Page<ExecutionView>> {
    const where: Prisma.ExecutionWhereInput = {
      status: filter.status,
      sourceId: filter.sourceId,
      createdAt: filter.from || filter.to ? { gte: filter.from, lt: filter.to } : undefined,
    };
    const [totalItems, rows] = await Promise.all([
      this.prisma.execution.count({ where }),
      this.prisma.execution.findMany({ where, include: EXECUTION_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...toSkipTake(page) }),
    ]);
    return { items: rows.map(toView), page: page.page, pageSize: page.pageSize, totalItems };
  }

  async findById(id: string, tx?: TransactionContext): Promise<ExecutionView | null> {
    const row = await db(this.prisma, tx).execution.findUnique({ where: { id }, include: EXECUTION_INCLUDE });
    return row ? toView(row) : null;
  }

  async findByIdempotencyKey(requestedById: string, key: string): Promise<ExecutionView | null> {
    const row = await this.prisma.execution.findUnique({
      where: { requestedById_idempotencyKey: { requestedById, idempotencyKey: key } },
      include: EXECUTION_INCLUDE,
    });
    return row ? toView(row) : null;
  }

  async create(input: NewExecution, tx: TransactionContext): Promise<ExecutionView> {
    try {
      const row = await db(this.prisma, tx).execution.create({
        data: {
          sourceId: input.sourceId,
          status: 'QUEUED',
          phase: input.phase,
          requestedById: input.requestedById,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          engineVersion: input.engineVersion,
          inputSnapshot: json(input.inputSnapshot),
          reproducedFromId: input.reproducedFromId,
        },
        include: EXECUTION_INCLUDE,
      });
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateIdempotencyKeyError();
      throw error;
    }
  }

  async listLogs(executionId: string, page: PageRequest): Promise<Page<ExecutionLogView>> {
    const [totalItems, rows] = await Promise.all([
      this.prisma.executionLog.count({ where: { executionId } }),
      this.prisma.executionLog.findMany({ where: { executionId }, orderBy: { id: 'asc' }, ...toSkipTake(page) }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id.toString(),
        occurredAt: row.occurredAt,
        level: row.level,
        step: row.step,
        message: row.message,
        details: row.details,
      })),
      page: page.page,
      pageSize: page.pageSize,
      totalItems,
    };
  }

  async appendLog(executionId: string, entry: LogEntry, tx?: TransactionContext): Promise<void> {
    await db(this.prisma, tx).executionLog.create({
      data: {
        executionId,
        level: entry.level,
        step: entry.step.slice(0, 120),
        message: entry.message.slice(0, 1000),
        details: entry.details ? json(redact(entry.details)) : undefined,
      },
      select: { id: true },
    });
  }

  async requestCancel(id: string, tx: TransactionContext): Promise<boolean> {
    const result = await db(this.prisma, tx).execution.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] }, cancelRequested: false },
      data: { cancelRequested: true },
    });
    return result.count > 0;
  }

  async isCancelRequested(id: string): Promise<boolean> {
    const row = await this.prisma.execution.findUnique({ where: { id }, select: { cancelRequested: true, status: true } });
    return !row || row.cancelRequested || row.status !== 'RUNNING';
  }

  async markRunning(id: string, startedAt: Date, engineVersion: string): Promise<boolean> {
    const result = await this.prisma.execution.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'RUNNING', startedAt, engineVersion },
    });
    return result.count > 0;
  }

  async updateProgress(id: string, progress: ExecutionProgress, rowsIn?: number): Promise<void> {
    await this.prisma.execution.updateMany({ where: { id, status: 'RUNNING' }, data: { progress: json(progress), rowsIn } });
  }

  async markSucceeded(id: string, result: { rowsOut: number; totalRules: number; finishedAt: Date }, tx: TransactionContext): Promise<boolean> {
    const progress: ExecutionProgress = { stage: 'DONE', rulesApplied: result.totalRules, totalRules: result.totalRules };
    const updated = await db(this.prisma, tx).execution.updateMany({
      where: { id, status: 'RUNNING' },
      data: { status: 'SUCCEEDED', rowsOut: result.rowsOut, finishedAt: result.finishedAt, progress: json(progress) },
    });
    return updated.count > 0;
  }

  async markFailed(id: string, failure: { errorCode: string; errorMessage: string; finishedAt: Date }, tx: TransactionContext): Promise<boolean> {
    const updated = await db(this.prisma, tx).execution.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'FAILED', errorCode: failure.errorCode.slice(0, 64), errorMessage: failure.errorMessage, finishedAt: failure.finishedAt },
    });
    return updated.count > 0;
  }

  async markCancelled(id: string, from: readonly ExecutionStatus[], finishedAt: Date, tx: TransactionContext): Promise<boolean> {
    const updated = await db(this.prisma, tx).execution.updateMany({
      where: { id, status: { in: [...from] } },
      data: { status: 'CANCELLED', finishedAt },
    });
    return updated.count > 0;
  }
}
