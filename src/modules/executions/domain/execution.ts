import { ConflictError, ValidationError } from '../../../shared/domain/errors';

export const EXECUTION_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/**
 * Allowed lifecycle transitions. RUNNING → QUEUED only happens when a worker crashed and the
 * job lease expired (the execution is retried from scratch with the same pinned inputs).
 */
const TRANSITIONS: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  QUEUED: ['RUNNING', 'CANCELLED', 'FAILED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'QUEUED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError('INVALID_EXECUTION_TRANSITION', `Execução em ${from} não pode passar para ${to}.`);
  }
}

export function isTerminal(status: ExecutionStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Inputs pinned when the execution is requested; guarantees reproducibility. */
export interface InputSnapshot {
  primaryImportId: string;
  referenceImports: Array<{ sourceId: string; importId: string }>;
  rules: Array<{ ruleId: string; ruleVersionId: string; version: number }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Validates a persisted snapshot (defensive: the column is JSON). */
export function parseInputSnapshot(value: unknown): InputSnapshot {
  const fail = () => new ValidationError('Snapshot de entrada da execução corrompido.', [], 'INVALID_INPUT_SNAPSHOT');
  if (typeof value !== 'object' || value === null) throw fail();
  const record = value as Record<string, unknown>;
  if (!isUuid(record.primaryImportId) || !Array.isArray(record.referenceImports) || !Array.isArray(record.rules)) {
    throw fail();
  }
  const referenceImports = record.referenceImports.map((entry) => {
    const item = entry as Record<string, unknown>;
    if (!item || !isUuid(item.sourceId) || !isUuid(item.importId)) throw fail();
    return { sourceId: item.sourceId, importId: item.importId };
  });
  const rules = record.rules.map((entry) => {
    const item = entry as Record<string, unknown>;
    if (!item || !isUuid(item.ruleId) || !isUuid(item.ruleVersionId) || typeof item.version !== 'number') throw fail();
    return { ruleId: item.ruleId, ruleVersionId: item.ruleVersionId, version: item.version };
  });
  return { primaryImportId: record.primaryImportId, referenceImports, rules };
}

export interface ExecutionProgress {
  stage: 'LOADING' | 'APPLYING_RULES' | 'WRITING_REPORT' | 'DONE';
  rulesApplied: number;
  totalRules: number;
}
