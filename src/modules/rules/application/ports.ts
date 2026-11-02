import type { TransactionContext } from '../../../shared/application/ports';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { ExecutableRule, RuleDefinition, RuleType } from '../domain/rule-definition';

export type RuleStatus = 'ACTIVE' | 'INACTIVE';

export interface RuleContent {
  name: string;
  description: string | null;
  /** Execution phase (context of the original "Fase"); null applies to every execution. */
  phase: string | null;
  executionOrder: number;
  definition: RuleDefinition;
}

export interface RuleVersionView extends RuleContent {
  id: string;
  ruleId: string;
  version: number;
  changeReason: string | null;
  createdById: string;
  createdAt: Date;
}

export interface RuleView {
  id: string;
  type: RuleType;
  targetSourceId: string;
  status: RuleStatus;
  currentVersion: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  current: RuleVersionView;
}

export interface RuleFilter {
  status?: RuleStatus;
  type?: RuleType;
  targetSourceId?: string;
}

export interface NewRule extends RuleContent {
  type: RuleType;
  targetSourceId: string;
  changeReason: string | null;
}

export interface RulesRepository {
  list(filter: RuleFilter, page: PageRequest): Promise<Page<RuleView>>;
  findById(id: string, tx?: TransactionContext): Promise<RuleView | null>;
  listVersions(ruleId: string, page: PageRequest): Promise<Page<RuleVersionView>>;
  findVersion(ruleId: string, version: number): Promise<RuleVersionView | null>;
  create(rule: NewRule, createdById: string, tx: TransactionContext): Promise<RuleView>;
  /**
   * Appends version `expectedVersion + 1` only if the current version is still `expectedVersion`
   * (optimistic concurrency). Returns false when another change won the race.
   */
  addVersion(ruleId: string, expectedVersion: number, content: RuleContent, changeReason: string, createdById: string, tx: TransactionContext): Promise<boolean>;
  setStatus(ruleId: string, status: RuleStatus, tx: TransactionContext): Promise<void>;
  /** Current versions of the ACTIVE rules of a source applicable to the phase (null = phase-less only). */
  listExecutable(sourceId: string, phase: string | null, tx?: TransactionContext): Promise<ExecutableRule[]>;
  /** Exact versions pinned by an execution snapshot. */
  loadVersions(ruleVersionIds: readonly string[]): Promise<ExecutableRule[]>;
}

export const RULES_REPOSITORY = 'RulesRepository';
