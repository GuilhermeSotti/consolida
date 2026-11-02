import type { TransactionContext } from '../../../shared/application/ports';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Dataset } from '../../../shared/domain/tabular';
import type { ExecutionProgress, ExecutionStatus, InputSnapshot } from '../domain/execution';

export interface ExecutionView {
  id: string;
  sourceId: string;
  status: ExecutionStatus;
  phase: string | null;
  requestedById: string;
  idempotencyKey: string | null;
  requestHash: string;
  engineVersion: string;
  inputSnapshot: InputSnapshot;
  reproducedFromId: string | null;
  cancelRequested: boolean;
  rowsIn: number | null;
  rowsOut: number | null;
  progress: ExecutionProgress | null;
  errorCode: string | null;
  errorMessage: string | null;
  reportId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface ExecutionLogView {
  id: string;
  occurredAt: Date;
  level: LogLevel;
  step: string;
  message: string;
  details: unknown;
}

export interface ExecutionFilter {
  status?: ExecutionStatus;
  sourceId?: string;
  from?: Date;
  to?: Date;
}

export interface NewExecution {
  sourceId: string;
  phase: string | null;
  requestedById: string;
  idempotencyKey: string | null;
  requestHash: string;
  engineVersion: string;
  inputSnapshot: InputSnapshot;
  reproducedFromId: string | null;
}

export interface LogEntry {
  level: LogLevel;
  step: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Thrown by the repository when (requestedById, idempotencyKey) already exists. */
export class DuplicateIdempotencyKeyError extends Error {
  constructor() {
    super('Duplicate idempotency key');
    this.name = 'DuplicateIdempotencyKeyError';
  }
}

export interface ExecutionsRepository {
  list(filter: ExecutionFilter, page: PageRequest): Promise<Page<ExecutionView>>;
  findById(id: string, tx?: TransactionContext): Promise<ExecutionView | null>;
  findByIdempotencyKey(requestedById: string, key: string): Promise<ExecutionView | null>;
  create(input: NewExecution, tx: TransactionContext): Promise<ExecutionView>;
  listLogs(executionId: string, page: PageRequest): Promise<Page<ExecutionLogView>>;
  appendLog(executionId: string, entry: LogEntry, tx?: TransactionContext): Promise<void>;
  requestCancel(id: string, tx: TransactionContext): Promise<boolean>;
  isCancelRequested(id: string): Promise<boolean>;
  /** QUEUED/RUNNING → RUNNING (RUNNING again when a crashed attempt is retried). Records the engine actually used. */
  markRunning(id: string, startedAt: Date, engineVersion: string): Promise<boolean>;
  updateProgress(id: string, progress: ExecutionProgress, rowsIn?: number): Promise<void>;
  markSucceeded(id: string, result: { rowsOut: number; totalRules: number; finishedAt: Date }, tx: TransactionContext): Promise<boolean>;
  markFailed(id: string, failure: { errorCode: string; errorMessage: string; finishedAt: Date }, tx: TransactionContext): Promise<boolean>;
  markCancelled(id: string, from: readonly ExecutionStatus[], finishedAt: Date, tx: TransactionContext): Promise<boolean>;
}

export interface ImportRef {
  id: string;
  sourceId: string;
  status: string;
}

export interface ExecutionDataStore {
  latestValidatedImport(sourceId: string): Promise<ImportRef | null>;
  findImport(importId: string): Promise<ImportRef | null>;
  loadImportDataset(importId: string): Promise<Dataset>;
  /** Persists the report and its rows inside the caller's transaction (visible only after commit). */
  writeReport(input: { executionId: string; sourceId: string; name: string; dataset: Dataset; availableAt: Date }, tx: TransactionContext): Promise<string>;
}

export interface ExecutionLimits {
  maxRows: number;
}

export const EXECUTIONS_TOKENS = {
  EXECUTIONS_REPOSITORY: 'ExecutionsRepository',
  EXECUTION_DATA_STORE: 'ExecutionDataStore',
  EXECUTION_LIMITS: 'ExecutionLimits',
} as const;
