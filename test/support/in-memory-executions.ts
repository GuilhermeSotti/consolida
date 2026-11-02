import {
  DuplicateIdempotencyKeyError,
  type ExecutionDataStore,
  type ExecutionFilter,
  type ExecutionLogView,
  type ExecutionsRepository,
  type ExecutionView,
  type ImportRef,
  type LogEntry,
  type NewExecution,
} from '../../src/modules/executions/application/ports';
import type { ExecutionProgress, ExecutionStatus } from '../../src/modules/executions/domain/execution';
import type { Page, PageRequest } from '../../src/shared/domain/pagination';
import type { Dataset } from '../../src/shared/domain/tabular';
import { uuid } from './fakes';

let sequence = 700;

export class InMemoryExecutions implements ExecutionsRepository {
  readonly executions = new Map<string, ExecutionView>();
  readonly logs = new Map<string, ExecutionLogView[]>();
  /** Simulates a concurrent request inserting the same idempotency key first. */
  raceWith: ExecutionView | null = null;

  async list(_filter: ExecutionFilter, page: PageRequest): Promise<Page<ExecutionView>> {
    const items = [...this.executions.values()];
    return { items, page: page.page, pageSize: page.pageSize, totalItems: items.length };
  }
  async findById(id: string): Promise<ExecutionView | null> {
    const found = this.executions.get(id);
    return found ? { ...found } : null;
  }
  async findByIdempotencyKey(requestedById: string, key: string): Promise<ExecutionView | null> {
    return [...this.executions.values()].find((item) => item.requestedById === requestedById && item.idempotencyKey === key) ?? null;
  }
  async create(input: NewExecution): Promise<ExecutionView> {
    if (this.raceWith) {
      this.executions.set(this.raceWith.id, this.raceWith);
      this.raceWith = null;
      throw new DuplicateIdempotencyKeyError();
    }
    const view: ExecutionView = {
      ...input,
      id: uuid(sequence++),
      status: 'QUEUED',
      cancelRequested: false,
      rowsIn: null,
      rowsOut: null,
      progress: null,
      errorCode: null,
      errorMessage: null,
      reportId: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
    };
    this.executions.set(view.id, view);
    return view;
  }
  async listLogs(executionId: string, page: PageRequest): Promise<Page<ExecutionLogView>> {
    const items = this.logs.get(executionId) ?? [];
    return { items, page: page.page, pageSize: page.pageSize, totalItems: items.length };
  }
  async appendLog(executionId: string, entry: LogEntry): Promise<void> {
    const list = this.logs.get(executionId) ?? [];
    list.push({ id: String(list.length + 1), occurredAt: new Date(), level: entry.level, step: entry.step, message: entry.message, details: entry.details ?? null });
    this.logs.set(executionId, list);
  }
  async requestCancel(id: string): Promise<boolean> {
    const item = this.executions.get(id)!;
    if (!['QUEUED', 'RUNNING'].includes(item.status) || item.cancelRequested) return false;
    item.cancelRequested = true;
    return true;
  }
  async isCancelRequested(id: string): Promise<boolean> {
    const item = this.executions.get(id);
    return !item || item.cancelRequested || item.status !== 'RUNNING';
  }
  async markRunning(id: string, startedAt: Date, engineVersion: string): Promise<boolean> {
    return this.transition(id, ['QUEUED', 'RUNNING'], { status: 'RUNNING', startedAt, engineVersion });
  }
  async updateProgress(id: string, progress: ExecutionProgress, rowsIn?: number): Promise<void> {
    const item = this.executions.get(id)!;
    item.progress = progress;
    if (rowsIn !== undefined) item.rowsIn = rowsIn;
  }
  async markSucceeded(id: string, result: { rowsOut: number; totalRules: number; finishedAt: Date }): Promise<boolean> {
    return this.transition(id, ['RUNNING'], { status: 'SUCCEEDED', rowsOut: result.rowsOut, finishedAt: result.finishedAt });
  }
  async markFailed(id: string, failure: { errorCode: string; errorMessage: string; finishedAt: Date }): Promise<boolean> {
    return this.transition(id, ['QUEUED', 'RUNNING'], { status: 'FAILED', ...failure });
  }
  async markCancelled(id: string, from: readonly ExecutionStatus[], finishedAt: Date): Promise<boolean> {
    return this.transition(id, from, { status: 'CANCELLED', finishedAt });
  }
  private transition(id: string, from: readonly ExecutionStatus[], changes: Partial<ExecutionView>): boolean {
    const item = this.executions.get(id);
    if (!item || !from.includes(item.status)) return false;
    Object.assign(item, changes);
    return true;
  }
}

export class InMemoryExecutionData implements ExecutionDataStore {
  readonly imports = new Map<string, ImportRef & { dataset: Dataset; createdAt: number }>();
  readonly reports: Array<{ id: string; executionId: string; name: string; dataset: Dataset }> = [];

  addImport(sourceId: string, dataset: Dataset, status = 'VALIDATED'): string {
    const id = uuid(sequence++);
    this.imports.set(id, { id, sourceId, status, dataset, createdAt: sequence });
    return id;
  }
  async latestValidatedImport(sourceId: string): Promise<ImportRef | null> {
    const candidates = [...this.imports.values()].filter((item) => item.sourceId === sourceId && item.status === 'VALIDATED');
    candidates.sort((a, b) => b.createdAt - a.createdAt);
    return candidates[0] ? { id: candidates[0].id, sourceId, status: 'VALIDATED' } : null;
  }
  async findImport(importId: string): Promise<ImportRef | null> {
    const found = this.imports.get(importId);
    return found ? { id: found.id, sourceId: found.sourceId, status: found.status } : null;
  }
  async loadImportDataset(importId: string): Promise<Dataset> {
    return this.imports.get(importId)!.dataset;
  }
  async writeReport(input: { executionId: string; name: string; dataset: Dataset }): Promise<string> {
    const id = uuid(sequence++);
    this.reports.push({ id, executionId: input.executionId, name: input.name, dataset: input.dataset });
    return id;
  }
}
