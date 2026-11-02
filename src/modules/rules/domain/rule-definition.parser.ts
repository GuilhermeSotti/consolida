import { type ErrorDetail, ValidationError } from '../../../shared/domain/errors';
import { canonicalColumnName, type Scalar } from '../../../shared/domain/tabular';
import {
  COMPARE_AS,
  COMPARISON_OPERATORS,
  NORMALIZATION_MODES,
  type CompareAs,
  type ComparisonOperator,
  type NormalizationMode,
} from './engine/values';
import {
  ARITHMETIC_OPERATIONS,
  LOOKUP_MATCH_MODES,
  RULE_TYPES,
  STANDARDIZATION_KINDS,
  type ArithmeticDefinition,
  type AssignedValue,
  type Condition,
  type ConditionalAssignmentDefinition,
  type FilterDefinition,
  type LookupDefinition,
  type ProjectionDefinition,
  type RuleDefinitionByType,
  type RuleType,
  type StandardizationDefinition,
  type StandardizationOperation,
} from './rule-definition';

const MAX_TEXT = 500;
const MAX_COLUMN = 128;
const MAX_VALUES = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Issues = ErrorDetail[];

function issue(issues: Issues, field: string, message: string): null {
  issues.push({ field, message });
  return null;
}

function object(value: unknown, path: string, issues: Issues, allowed: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return issue(issues, path, 'deve ser um objeto');
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) issue(issues, path ? `${path}.${key}` : key, 'propriedade não permitida');
  }
  return record;
}

function text(value: unknown, path: string, issues: Issues, opts: { min?: number; max?: number } = {}): string | null {
  const min = opts.min ?? 1;
  const max = opts.max ?? MAX_TEXT;
  if (typeof value !== 'string') return issue(issues, path, 'deve ser texto');
  if (value.length < min) return issue(issues, path, min === 1 ? 'não pode ser vazio' : `deve ter ao menos ${min} caracteres`);
  if (value.length > max) return issue(issues, path, `deve ter no máximo ${max} caracteres`);
  return value;
}

function column(value: unknown, path: string, issues: Issues): string | null {
  if (typeof value !== 'string') return issue(issues, path, 'deve ser o nome de uma coluna');
  const canonical = canonicalColumnName(value);
  if (!canonical) return issue(issues, path, 'nome de coluna vazio');
  if (canonical.length > MAX_COLUMN) return issue(issues, path, `nome de coluna com mais de ${MAX_COLUMN} caracteres`);
  return canonical;
}

function list<T>(
  value: unknown,
  path: string,
  issues: Issues,
  item: (v: unknown, p: string) => T | null,
  opts: { min?: number; max?: number; unique?: boolean } = {},
): T[] | null {
  const min = opts.min ?? 1;
  const max = opts.max ?? MAX_VALUES;
  if (!Array.isArray(value)) return issue(issues, path, 'deve ser uma lista');
  if (value.length < min) return issue(issues, path, `deve ter ao menos ${min} item(ns)`);
  if (value.length > max) return issue(issues, path, `deve ter no máximo ${max} itens`);
  const output: T[] = [];
  let valid = true;
  value.forEach((entry, index) => {
    const parsed = item(entry, `${path}[${index}]`);
    if (parsed === null) valid = false;
    else output.push(parsed);
  });
  if (!valid) return null;
  if (opts.unique) {
    const keys = output.map((v) => JSON.stringify(v));
    if (new Set(keys).size !== keys.length) return issue(issues, path, 'não pode conter itens repetidos');
  }
  return output;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string, issues: Issues): T | null {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  return issue(issues, path, `deve ser um de: ${allowed.join(', ')}`);
}

function scalar(value: unknown, path: string, issues: Issues): Scalar | undefined {
  if (value === null) return null;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT) {
      issue(issues, path, `deve ter no máximo ${MAX_TEXT} caracteres`);
      return undefined;
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  issue(issues, path, 'deve ser texto, número, booleano ou null');
  return undefined;
}

/** Scalar lists need their own reader because `null` is a valid element. */
function scalarList(value: unknown, path: string, issues: Issues, opts: { min: number; max: number }): Scalar[] | null {
  if (!Array.isArray(value)) return issue(issues, path, 'deve ser uma lista');
  if (value.length < opts.min) return issue(issues, path, `deve ter ao menos ${opts.min} item(ns)`);
  if (value.length > opts.max) return issue(issues, path, `deve ter no máximo ${opts.max} itens`);
  const output: Scalar[] = [];
  let valid = true;
  value.forEach((entry, index) => {
    const parsed = scalar(entry, `${path}[${index}]`, issues);
    if (parsed === undefined) valid = false;
    else output.push(parsed);
  });
  return valid ? output : null;
}

function integer(value: unknown, path: string, issues: Issues, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return issue(issues, path, 'deve ser um número inteiro');
  if (value < min || value > max) return issue(issues, path, `deve estar entre ${min} e ${max}`);
  return value;
}

function bool(value: unknown, path: string, issues: Issues): boolean | null {
  if (typeof value !== 'boolean') return issue(issues, path, 'deve ser verdadeiro ou falso');
  return value;
}

function uuid(value: unknown, path: string, issues: Issues): string | null {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return issue(issues, path, 'deve ser um UUID');
  return value.toLowerCase();
}

function condition(value: unknown, path: string, issues: Issues): Condition | null {
  const record = object(value, path, issues, ['column', 'operator', 'values', 'normalization', 'compareAs']);
  if (!record) return null;
  const col = column(record.column, `${path}.column`, issues);
  const operator = oneOf<ComparisonOperator>(record.operator, COMPARISON_OPERATORS, `${path}.operator`, issues);
  const values = scalarList(record.values, `${path}.values`, issues, { min: 1, max: MAX_VALUES });
  const normalization =
    record.normalization === undefined
      ? []
      : list<NormalizationMode>(
          record.normalization,
          `${path}.normalization`,
          issues,
          (v, p) => oneOf(v, NORMALIZATION_MODES, p, issues),
          { min: 0, max: 10 },
        );
  const compareAs =
    record.compareAs === undefined ? 'AUTO' : oneOf<CompareAs>(record.compareAs, COMPARE_AS, `${path}.compareAs`, issues);
  if (!col || !operator || !values || !normalization || !compareAs) return null;
  // Null values are only meaningful for equality checks.
  if (values.includes(null) && operator !== 'EQUALS' && operator !== 'NOT_EQUALS') {
    return issue(issues, `${path}.values`, 'null só pode ser usado com EQUALS ou NOT_EQUALS');
  }
  return { column: col, operator, values, normalization, compareAs };
}

function parseFilter(input: unknown, issues: Issues): FilterDefinition | null {
  const record = object(input, '', issues, ['condition']);
  if (!record) return null;
  const cond = condition(record.condition, 'condition', issues);
  return cond ? { condition: cond } : null;
}

function parseConditionalAssignment(input: unknown, issues: Issues): ConditionalAssignmentDefinition | null {
  const record = object(input, '', issues, ['condition', 'targetColumn', 'value']);
  if (!record) return null;
  const cond = condition(record.condition, 'condition', issues);
  const target = column(record.targetColumn, 'targetColumn', issues);
  let assigned: AssignedValue | null = null;
  const valueRecord = object(record.value, 'value', issues, ['kind', 'value', 'column']);
  if (valueRecord) {
    const kind = oneOf(valueRecord.kind, ['LITERAL', 'COLUMN'] as const, 'value.kind', issues);
    if (kind === 'LITERAL') {
      if (valueRecord.column !== undefined) issue(issues, 'value.column', 'não se aplica a LITERAL');
      const literal = scalar(valueRecord.value, 'value.value', issues);
      if (literal !== undefined) assigned = { kind: 'LITERAL', value: literal };
    } else if (kind === 'COLUMN') {
      if (valueRecord.value !== undefined) issue(issues, 'value.value', 'não se aplica a COLUMN');
      const source = column(valueRecord.column, 'value.column', issues);
      if (source) assigned = { kind: 'COLUMN', column: source };
    }
  }
  if (!cond || !target || !assigned) return null;
  return { condition: cond, targetColumn: target, value: assigned };
}

function parseArithmetic(input: unknown, issues: Issues): ArithmeticDefinition | null {
  const record = object(input, '', issues, ['operands', 'operations', 'targetColumn']);
  if (!record) return null;
  const operands = list(record.operands, 'operands', issues, (v, p) => column(v, p, issues), { min: 1, max: 50 });
  const operations = list(
    record.operations,
    'operations',
    issues,
    (v, p) => oneOf(v, ARITHMETIC_OPERATIONS, p, issues),
    { min: 0, max: 49 },
  );
  const target = column(record.targetColumn, 'targetColumn', issues);
  if (!operands || !operations || !target) return null;
  if (operations.length !== operands.length - 1) {
    return issue(issues, 'operations', `deve ter exatamente ${operands.length - 1} operação(ões) (uma entre cada par de operandos)`);
  }
  return { operands, operations, targetColumn: target };
}

function parseStandardizationOperation(value: unknown, issues: Issues): StandardizationOperation | null {
  const base = object(value, 'operation', issues, [
    'kind',
    'length',
    'substrings',
    'removeSpecialCharacters',
    'tokens',
    'replacement',
    'start',
  ]);
  if (!base) return null;
  const kind = oneOf(base.kind, STANDARDIZATION_KINDS, 'operation.kind', issues);
  if (!kind) return null;
  const allowedByKind: Record<string, string[]> = {
    TRUNCATE: ['length'],
    REMOVE: ['substrings'],
    CLEAN: ['removeSpecialCharacters'],
    KEEP: ['tokens'],
    TRIM: [],
    REPLACE_SPACES: ['replacement'],
    NORMALIZE: [],
    INDEX: ['start'],
  };
  for (const key of Object.keys(base)) {
    if (key !== 'kind' && !allowedByKind[kind].includes(key)) issue(issues, `operation.${key}`, `não se aplica a ${kind}`);
  }
  const nonEmptyText = (v: unknown, p: string) => text(v, p, issues, { min: 1, max: 200 });
  switch (kind) {
    case 'TRUNCATE': {
      const length = integer(base.length, 'operation.length', issues, 0, 10000);
      return length === null ? null : { kind, length };
    }
    case 'REMOVE': {
      const substrings = list(base.substrings, 'operation.substrings', issues, nonEmptyText, { min: 1, max: 100 });
      return substrings ? { kind, substrings } : null;
    }
    case 'CLEAN': {
      const flag = base.removeSpecialCharacters === undefined ? false : bool(base.removeSpecialCharacters, 'operation.removeSpecialCharacters', issues);
      return flag === null ? null : { kind, removeSpecialCharacters: flag };
    }
    case 'KEEP': {
      const tokens = list(base.tokens, 'operation.tokens', issues, nonEmptyText, { min: 1, max: 100 });
      return tokens ? { kind, tokens } : null;
    }
    case 'REPLACE_SPACES': {
      const replacement = text(base.replacement, 'operation.replacement', issues, { min: 1, max: 50 });
      return replacement === null ? null : { kind, replacement };
    }
    case 'INDEX': {
      const start = base.start === undefined ? 1 : integer(base.start, 'operation.start', issues, 0, 2_000_000_000);
      return start === null ? null : { kind, start };
    }
    case 'TRIM':
      return { kind };
    case 'NORMALIZE':
      return { kind };
  }
}

function parseStandardization(input: unknown, issues: Issues): StandardizationDefinition | null {
  const record = object(input, '', issues, ['columns', 'operation']);
  if (!record) return null;
  let columns: string[] | 'ALL' | null;
  if (record.columns === 'ALL') columns = 'ALL';
  else columns = list(record.columns, 'columns', issues, (v, p) => column(v, p, issues), { min: 1, max: 500, unique: true });
  const operation = parseStandardizationOperation(record.operation, issues);
  if (!columns || !operation) return null;
  if (operation.kind === 'INDEX' && columns === 'ALL') {
    return issue(issues, 'columns', 'INDEX exige a lista explícita de colunas');
  }
  return { columns, operation };
}

function parseLookup(input: unknown, issues: Issues): LookupDefinition | null {
  const record = object(input, '', issues, [
    'keyColumns',
    'referenceSourceIds',
    'referenceKeyColumns',
    'columnsToBring',
    'matchMode',
  ]);
  if (!record) return null;
  const keyColumns = list(record.keyColumns, 'keyColumns', issues, (v, p) => column(v, p, issues), { min: 1, max: 10, unique: true });
  const referenceSourceIds = list(record.referenceSourceIds, 'referenceSourceIds', issues, (v, p) => uuid(v, p, issues), {
    min: 1,
    max: 10,
    unique: true,
  });
  const referenceKeyColumns = list(record.referenceKeyColumns, 'referenceKeyColumns', issues, (v, p) => column(v, p, issues), {
    min: 1,
    max: 10,
    unique: true,
  });
  const columnsToBring = list(record.columnsToBring, 'columnsToBring', issues, (v, p) => column(v, p, issues), {
    min: 1,
    max: 200,
    unique: true,
  });
  const matchMode = record.matchMode === undefined ? 'EXACT' : oneOf(record.matchMode, LOOKUP_MATCH_MODES, 'matchMode', issues);
  if (!keyColumns || !referenceSourceIds || !referenceKeyColumns || !columnsToBring || !matchMode) return null;
  if (keyColumns.length !== referenceKeyColumns.length) {
    return issue(issues, 'referenceKeyColumns', 'deve ter a mesma quantidade de colunas que keyColumns');
  }
  return { keyColumns, referenceSourceIds, referenceKeyColumns, columnsToBring, matchMode };
}

function parseProjection(input: unknown, issues: Issues): ProjectionDefinition | null {
  const record = object(input, '', issues, ['columns']);
  if (!record) return null;
  const columns = list(
    record.columns,
    'columns',
    issues,
    (v, p) => {
      const entry = object(v, p, issues, ['source', 'as']);
      if (!entry) return null;
      const source = column(entry.source, `${p}.source`, issues);
      const alias = entry.as === undefined ? source : column(entry.as, `${p}.as`, issues);
      return source && alias ? { source, as: alias } : null;
    },
    { min: 1, max: 500 },
  );
  if (!columns) return null;
  const aliases = columns.map((c) => c.as);
  if (new Set(aliases).size !== aliases.length) return issue(issues, 'columns', 'os nomes de saída (as) devem ser únicos');
  return { columns };
}

const PARSERS: { [K in RuleType]: (input: unknown, issues: Issues) => RuleDefinitionByType[K] | null } = {
  FILTER: parseFilter,
  CONDITIONAL_ASSIGNMENT: parseConditionalAssignment,
  ARITHMETIC: parseArithmetic,
  STANDARDIZATION: parseStandardization,
  LOOKUP: parseLookup,
  PROJECTION: parseProjection,
};

export function isRuleType(value: unknown): value is RuleType {
  return typeof value === 'string' && (RULE_TYPES as readonly string[]).includes(value);
}

/**
 * Validates and canonicalizes a rule definition coming from an untrusted boundary
 * (API request or persisted JSON). Column references are canonicalized; unknown properties
 * are rejected. Throws ValidationError listing every problem found.
 */
export function parseRuleDefinition<T extends RuleType>(type: T, input: unknown): RuleDefinitionByType[T] {
  const issues: Issues = [];
  const parser = PARSERS[type] as (input: unknown, issues: Issues) => RuleDefinitionByType[T] | null;
  const parsed = parser(input, issues);
  if (!parsed || issues.length > 0) {
    throw new ValidationError('Definição de regra inválida.', issues, 'INVALID_RULE_DEFINITION');
  }
  return parsed;
}
