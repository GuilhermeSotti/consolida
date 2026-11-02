import type { Dataset } from '../../../../shared/domain/tabular';
import type {
  ArithmeticDefinition,
  ConditionalAssignmentDefinition,
  ExecutableRule,
  FilterDefinition,
  LookupDefinition,
  ProjectionDefinition,
  RuleType,
  StandardizationDefinition,
} from '../rule-definition';
import {
  applyArithmetic,
  applyConditionalAssignment,
  applyFilter,
  applyLookup,
  applyProjection,
  applyStandardization,
  type OperationOutcome,
  RowLimitExceededError,
} from './operations';

/** Bumped whenever results for the same inputs may change; stored with each execution. */
export const ENGINE_VERSION = '1.0.0';

/**
 * Stage order mirrors `RulesApplicator.ApplyAll` of the original script:
 * Matrix → Aritmética → Causante → (Variável) → Constante → Padronal, then the projection.
 * Within a stage rules run by `executionOrder` ("Ordenação") and then by id (determinism).
 */
export const STAGE_ORDER: Readonly<Record<RuleType, number>> = {
  LOOKUP: 10,
  ARITHMETIC: 20,
  CONDITIONAL_ASSIGNMENT: 30,
  FILTER: 50,
  STANDARDIZATION: 60,
  PROJECTION: 70,
};

export function sortRules<T extends Pick<ExecutableRule, 'type' | 'executionOrder' | 'ruleId'>>(rules: readonly T[]): T[] {
  return [...rules].sort(
    (a, b) =>
      STAGE_ORDER[a.type] - STAGE_ORDER[b.type] ||
      a.executionOrder - b.executionOrder ||
      (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0),
  );
}

export interface StepReport {
  ruleId: string;
  ruleVersionId: string;
  version: number;
  name: string;
  type: RuleType;
  rowsBefore: number;
  rowsAfter: number;
  affectedRows: number;
  durationMs: number;
  warnings: string[];
}

export interface EngineInput {
  dataset: Dataset;
  references: ReadonlyMap<string, Dataset>;
  rules: readonly ExecutableRule[];
}

export interface EngineOptions {
  /** Checked before each rule; returning true aborts with EngineCancelledError. */
  shouldCancel?: () => boolean;
  /** Called after each rule (e.g. to persist progress). */
  onStep?: (step: StepReport, index: number, total: number) => void | Promise<void>;
  /** Upper bound for rows produced by any step (protects memory, e.g. LOOKUP duplication). */
  maxRows?: number;
  now?: () => number;
}

export interface EngineResult {
  dataset: Dataset;
  steps: StepReport[];
}

export class EngineCancelledError extends Error {
  constructor() {
    super('Execução cancelada.');
    this.name = 'EngineCancelledError';
  }
}

export class EngineLimitError extends Error {
  constructor(
    readonly ruleId: string,
    readonly rows: number,
    readonly maxRows: number,
  ) {
    super(`A regra ${ruleId} produziu ${rows} linhas, acima do limite de ${maxRows}.`);
    this.name = 'EngineLimitError';
  }
}

function applyRule(dataset: Dataset, rule: ExecutableRule, references: ReadonlyMap<string, Dataset>, maxRows: number): OperationOutcome {
  switch (rule.type) {
    case 'FILTER':
      return applyFilter(dataset, rule.definition as FilterDefinition);
    case 'CONDITIONAL_ASSIGNMENT':
      return applyConditionalAssignment(dataset, rule.definition as ConditionalAssignmentDefinition);
    case 'ARITHMETIC':
      return applyArithmetic(dataset, rule.definition as ArithmeticDefinition);
    case 'STANDARDIZATION':
      return applyStandardization(dataset, rule.definition as StandardizationDefinition);
    case 'LOOKUP':
      return applyLookup(dataset, rule.definition as LookupDefinition, references, maxRows);
    case 'PROJECTION':
      return applyProjection(dataset, rule.definition as ProjectionDefinition);
  }
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Applies the rules to the dataset deterministically. Inputs are never mutated. Between rules
 * the engine yields to the event loop so that cancellation flags and heartbeats can be served.
 */
export async function runRules(input: EngineInput, options: EngineOptions = {}): Promise<EngineResult> {
  const now = options.now ?? (() => performance.now());
  const ordered = sortRules(input.rules);
  const steps: StepReport[] = [];
  let current: Dataset = input.dataset;
  for (let index = 0; index < ordered.length; index += 1) {
    await yieldToEventLoop();
    if (options.shouldCancel?.()) throw new EngineCancelledError();
    const rule = ordered[index];
    const started = now();
    const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
    let outcome: OperationOutcome;
    try {
      outcome = applyRule(current, rule, input.references, maxRows);
    } catch (error) {
      if (error instanceof RowLimitExceededError) throw new EngineLimitError(rule.ruleId, error.rows, maxRows);
      throw error;
    }
    if (outcome.dataset.rows.length > maxRows) {
      throw new EngineLimitError(rule.ruleId, outcome.dataset.rows.length, maxRows);
    }
    const step: StepReport = {
      ruleId: rule.ruleId,
      ruleVersionId: rule.ruleVersionId,
      version: rule.version,
      name: rule.name,
      type: rule.type,
      rowsBefore: current.rows.length,
      rowsAfter: outcome.dataset.rows.length,
      affectedRows: outcome.affectedRows,
      durationMs: Math.round((now() - started) * 1000) / 1000,
      warnings: outcome.warnings,
    };
    steps.push(step);
    current = outcome.dataset;
    await options.onStep?.(step, index, ordered.length);
  }
  return { dataset: current, steps };
}
