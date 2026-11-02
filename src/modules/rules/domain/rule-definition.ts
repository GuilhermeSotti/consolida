import type { Scalar } from '../../../shared/domain/tabular';
import type { CompareAs, ComparisonOperator, NormalizationMode } from './engine/values';

/**
 * Rule categories supported by the engine and their equivalents in the original
 * Power Query script ("Parametrização de Lógica ..."):
 *
 *  FILTER                 → Lógica Constante   (keeps rows that satisfy a condition)
 *  CONDITIONAL_ASSIGNMENT → Lógica Causante    (writes a value where a condition holds)
 *  ARITHMETIC             → Lógica Aritmética  (computes a column from other columns)
 *  STANDARDIZATION        → Lógica Padronal    (cleans/standardizes column values)
 *  LOOKUP                 → Lógica Matrix      (enriches rows from reference sources)
 *  PROJECTION             → Colunas Finais/Renomeadas ("Consolidação")
 *
 * Lógica Variável (allocation with tolerance) is NOT supported yet: its specification must be
 * confirmed with the business before being ported (docs/regras/semantica-do-motor.md).
 */
export const RULE_TYPES = [
  'FILTER',
  'CONDITIONAL_ASSIGNMENT',
  'ARITHMETIC',
  'STANDARDIZATION',
  'LOOKUP',
  'PROJECTION',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export interface Condition {
  /** Canonical column name tested on each row. */
  column: string;
  operator: ComparisonOperator;
  /** The condition holds when ANY value satisfies the operator ("Operados"). */
  values: Scalar[];
  /** Normalization applied to both sides before comparing ("Modo de Operação"). */
  normalization: NormalizationMode[];
  compareAs: CompareAs;
}

export interface FilterDefinition {
  condition: Condition;
}

export type AssignedValue =
  | { kind: 'LITERAL'; value: Scalar }
  | { kind: 'COLUMN'; column: string };

export interface ConditionalAssignmentDefinition {
  condition: Condition;
  targetColumn: string;
  value: AssignedValue;
}

export const ARITHMETIC_OPERATIONS = ['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'AVERAGE_BY_ROW_COUNT'] as const;
export type ArithmeticOperation = (typeof ARITHMETIC_OPERATIONS)[number];

export interface ArithmeticDefinition {
  /** Columns folded from left to right; non-numeric/blank values count as zero. */
  operands: string[];
  /** One operation between each pair of consecutive operands. */
  operations: ArithmeticOperation[];
  targetColumn: string;
}

export const STANDARDIZATION_KINDS = [
  'TRUNCATE',
  'REMOVE',
  'CLEAN',
  'KEEP',
  'TRIM',
  'REPLACE_SPACES',
  'NORMALIZE',
  'INDEX',
] as const;
export type StandardizationKind = (typeof STANDARDIZATION_KINDS)[number];

export type StandardizationOperation =
  | { kind: 'TRUNCATE'; length: number }
  | { kind: 'REMOVE'; substrings: string[] }
  | { kind: 'CLEAN'; removeSpecialCharacters: boolean }
  | { kind: 'KEEP'; tokens: string[] }
  | { kind: 'TRIM' }
  | { kind: 'REPLACE_SPACES'; replacement: string }
  | { kind: 'NORMALIZE' }
  | { kind: 'INDEX'; start: number };

export interface StandardizationDefinition {
  columns: string[] | 'ALL';
  operation: StandardizationOperation;
}

export const LOOKUP_MATCH_MODES = ['EXACT', 'NORMALIZED'] as const;
export type LookupMatchMode = (typeof LOOKUP_MATCH_MODES)[number];

export interface LookupDefinition {
  /** Key columns in the processed dataset ("Campo Inicial de Parametrização"). */
  keyColumns: string[];
  /** Reference sources combined as one table ("Aba Referência"). */
  referenceSourceIds: string[];
  /** Key columns in the reference table ("Comparação de Valor ID"), paired by position. */
  referenceKeyColumns: string[];
  /** Columns brought from the reference table ("Operados"). */
  columnsToBring: string[];
  /** EXACT = original join; NORMALIZED = "Pesquisa Avançada" (coalesce + NO DATA token). */
  matchMode: LookupMatchMode;
}

export interface ProjectionDefinition {
  columns: Array<{ source: string; as: string }>;
}

export interface RuleDefinitionByType {
  FILTER: FilterDefinition;
  CONDITIONAL_ASSIGNMENT: ConditionalAssignmentDefinition;
  ARITHMETIC: ArithmeticDefinition;
  STANDARDIZATION: StandardizationDefinition;
  LOOKUP: LookupDefinition;
  PROJECTION: ProjectionDefinition;
}

export type RuleDefinition = RuleDefinitionByType[RuleType];

/** A rule version ready to be executed (pinned by the execution input snapshot). */
export interface ExecutableRule<T extends RuleType = RuleType> {
  ruleId: string;
  ruleVersionId: string;
  version: number;
  name: string;
  type: T;
  executionOrder: number;
  definition: RuleDefinitionByType[T];
}

export function referencedSourceIds(type: RuleType, definition: RuleDefinition): string[] {
  return type === 'LOOKUP' ? [...(definition as LookupDefinition).referenceSourceIds] : [];
}
