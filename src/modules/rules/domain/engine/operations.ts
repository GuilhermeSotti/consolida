import { type Dataset, mergeColumns, type Row, type Scalar } from '../../../../shared/domain/tabular';
import type {
  ArithmeticDefinition,
  ArithmeticOperation,
  Condition,
  ConditionalAssignmentDefinition,
  FilterDefinition,
  LookupDefinition,
  ProjectionDefinition,
  StandardizationDefinition,
  StandardizationOperation,
} from '../rule-definition';
import { cleanText, compare, isBlank, normalize, normalizeKeyValue, parseNumber, toText } from './values';

/** Result of applying one rule to a dataset. */
export interface OperationOutcome {
  dataset: Dataset;
  /** Rows changed, removed or created by the rule. */
  affectedRows: number;
  warnings: string[];
}

/** Token written by the NORMALIZED lookup when the matched reference key is blank. */
export const NO_DATA_TOKEN = 'NO DATA';

/** Raised while a step is being built as soon as it exceeds the row limit (bounds memory). */
export class RowLimitExceededError extends Error {
  constructor(readonly rows: number) {
    super(`Limite de linhas excedido (${rows}).`);
    this.name = 'RowLimitExceededError';
  }
}

function value(row: Row, column: string): Scalar {
  const current = row[column];
  return current === undefined ? null : current;
}

export function evaluateCondition(row: Row, condition: Condition): boolean {
  if (!Object.prototype.hasOwnProperty.call(row, condition.column)) return false;
  const left = normalize(value(row, condition.column), condition.normalization);
  return condition.values.some((candidate) =>
    compare(left, condition.operator, normalize(candidate, condition.normalization), condition.compareAs),
  );
}

/** Lógica Constante: keeps the rows that satisfy the condition. Missing column → no-op + warning. */
export function applyFilter(dataset: Dataset, definition: FilterDefinition): OperationOutcome {
  const { condition } = definition;
  if (!dataset.columns.includes(condition.column)) {
    return {
      dataset,
      affectedRows: 0,
      warnings: [`Coluna ${condition.column} inexistente: filtro não aplicado.`],
    };
  }
  const rows = dataset.rows.filter((row) => evaluateCondition(row, condition));
  return { dataset: { columns: dataset.columns, rows }, affectedRows: dataset.rows.length - rows.length, warnings: [] };
}

/** Lógica Causante: writes the configured value where the condition holds; other rows keep their value. */
export function applyConditionalAssignment(dataset: Dataset, definition: ConditionalAssignmentDefinition): OperationOutcome {
  const warnings: string[] = [];
  const { condition, targetColumn, value: assigned } = definition;
  if (!dataset.columns.includes(condition.column)) {
    warnings.push(`Coluna ${condition.column} inexistente: nenhuma linha atende à condição.`);
  }
  if (assigned.kind === 'COLUMN' && !dataset.columns.includes(assigned.column)) {
    warnings.push(`Coluna de origem ${assigned.column} inexistente: valores atribuídos serão nulos.`);
  }
  const columns = dataset.columns.includes(targetColumn) ? dataset.columns : [...dataset.columns, targetColumn];
  let affected = 0;
  const rows = dataset.rows.map((row) => {
    const base: Row = Object.prototype.hasOwnProperty.call(row, targetColumn) ? row : { ...row, [targetColumn]: null };
    if (!evaluateCondition(row, condition)) return base;
    affected += 1;
    const newValue = assigned.kind === 'LITERAL' ? assigned.value : value(row, assigned.column);
    return { ...base, [targetColumn]: newValue };
  });
  return { dataset: { columns, rows }, affectedRows: affected, warnings };
}

function arithmetic(left: number | null, operation: ArithmeticOperation, right: number, rowCount: number): number | null {
  if (left === null) return null;
  switch (operation) {
    case 'ADD':
      return left + right;
    case 'SUBTRACT':
      return left - right;
    case 'MULTIPLY':
      return left * right;
    case 'DIVIDE':
      return right === 0 ? null : left / right;
    case 'AVERAGE_BY_ROW_COUNT':
      return rowCount === 0 ? null : left / rowCount;
  }
}

/**
 * Lógica Aritmética: folds the operand columns left to right. Blank/non-numeric operands count
 * as zero (original behaviour). Division by zero yields null and a warning (the original
 * produced ±Infinity, which cannot be persisted). The target column is (re)created at the end.
 */
export function applyArithmetic(dataset: Dataset, definition: ArithmeticDefinition): OperationOutcome {
  const warnings: string[] = [];
  const missing = definition.operands.filter((c) => !dataset.columns.includes(c));
  if (missing.length > 0) warnings.push(`Colunas inexistentes tratadas como zero: ${missing.join(', ')}.`);
  const rowCount = dataset.rows.length;
  let nullResults = 0;
  const rows = dataset.rows.map((row) => {
    const values = definition.operands.map((c) => parseNumber(value(row, c)) ?? 0);
    let result: number | null = values.length > 0 ? values[0] : null;
    for (let index = 0; index < definition.operations.length; index += 1) {
      result = arithmetic(result, definition.operations[index], values[index + 1] ?? 0, rowCount);
    }
    if (result !== null && !Number.isFinite(result)) result = null;
    if (result === null) nullResults += 1;
    const out: Row = {};
    for (const column of Object.keys(row)) {
      if (column !== definition.targetColumn) out[column] = row[column];
    }
    out[definition.targetColumn] = result;
    return out;
  });
  if (nullResults > 0) warnings.push(`${nullResults} linha(s) com resultado indefinido (divisão por zero) gravadas como nulo.`);
  const columns = [...dataset.columns.filter((c) => c !== definition.targetColumn), definition.targetColumn];
  return { dataset: { columns, rows }, affectedRows: rows.length, warnings };
}

function standardizeValue(original: Scalar, operation: StandardizationOperation): Scalar {
  if (original === null) return null;
  const text = toText(original);
  switch (operation.kind) {
    case 'TRUNCATE':
      return operation.length <= 0 ? '' : text.slice(0, operation.length);
    case 'REMOVE':
      return operation.substrings.reduce((acc, item) => acc.split(item).join(''), text);
    case 'CLEAN':
      return cleanText(text, operation.removeSpecialCharacters);
    case 'KEEP': {
      const lower = text.toLowerCase();
      const matches = operation.tokens.filter((token) => lower.includes(token.toLowerCase()));
      return matches.length === 0 ? null : matches.join('');
    }
    case 'TRIM':
      return text.trim();
    case 'REPLACE_SPACES':
      return text.split(' ').join(operation.replacement);
    case 'NORMALIZE':
      return normalizeKeyValue(original);
    case 'INDEX':
      return original;
  }
}

/**
 * Lógica Padronal: applies one standardization to the selected columns ("todas as colunas" = ALL).
 * INDEX replaces each listed column with a sequence starting at `start`, moved to the end
 * (the original intended behaviour; in the script a misspelled reference made it a silent no-op).
 */
export function applyStandardization(dataset: Dataset, definition: StandardizationDefinition): OperationOutcome {
  const warnings: string[] = [];
  const requested = definition.columns === 'ALL' ? dataset.columns : definition.columns;
  const targets = requested.filter((c) => dataset.columns.includes(c));
  const missing = requested.filter((c) => !dataset.columns.includes(c));
  if (missing.length > 0) warnings.push(`Colunas inexistentes ignoradas: ${missing.join(', ')}.`);
  if (targets.length === 0) return { dataset, affectedRows: 0, warnings };

  const { operation } = definition;
  if (operation.kind === 'INDEX') {
    const start = operation.start;
    const rows = dataset.rows.map((row, index) => {
      const next: Row = { ...row };
      for (const column of targets) next[column] = start + index;
      return next;
    });
    const columns = [...dataset.columns.filter((c) => !targets.includes(c)), ...targets];
    return { dataset: { columns, rows }, affectedRows: rows.length, warnings };
  }

  let affected = 0;
  const rows = dataset.rows.map((row) => {
    const next: Row = { ...row };
    let changed = false;
    for (const column of targets) {
      const before = value(row, column);
      const after = standardizeValue(before, operation);
      if (after !== before) changed = true;
      next[column] = after;
    }
    if (changed) affected += 1;
    return next;
  });
  return { dataset: { columns: dataset.columns, rows }, affectedRows: affected, warnings };
}

function unionDatasets(datasets: Dataset[]): Dataset {
  const columns = mergeColumns(...datasets.map((d) => d.columns));
  const rows = datasets.flatMap((d) => d.rows);
  return { columns, rows };
}

function rawKey(row: Row, columns: readonly string[]): string {
  return JSON.stringify(columns.map((c) => value(row, c)));
}

function normalizedKey(row: Row, columns: readonly string[]): string {
  return JSON.stringify(columns.map((c) => normalizeKeyValue(value(row, c))));
}

/**
 * Lógica Matrix: enriches the dataset with columns from the union of reference datasets.
 * Keys are compared after `normalizeKeyValue` in both modes (as in the original script).
 *
 * EXACT       — reference rows deduplicated by raw key; left join that duplicates a row when
 *               several reference rows share the normalized key; only columns absent from the
 *               dataset are added.
 * NORMALIZED  — reference deduplicated by normalized key (at most one match); for every key and
 *               requested column the dataset value is kept unless blank, otherwise the reference
 *               value is used ("NO DATA" when the matched reference key is blank). Those columns
 *               are moved to the end.
 * When the dataset has no rows, the projection of the reference (keys renamed) becomes the base.
 */
export function applyLookup(
  dataset: Dataset,
  definition: LookupDefinition,
  references: ReadonlyMap<string, Dataset>,
  maxRows = Number.POSITIVE_INFINITY,
): OperationOutcome {
  const warnings: string[] = [];
  const available = definition.referenceSourceIds.filter((id) => references.has(id));
  const missingRefs = definition.referenceSourceIds.filter((id) => !references.has(id));
  if (missingRefs.length > 0) warnings.push(`Fontes de referência ausentes: ${missingRefs.join(', ')}.`);
  if (available.length === 0) {
    return { dataset: ensureColumns(dataset, definition.columnsToBring), affectedRows: 0, warnings };
  }
  const reference = unionDatasets(available.map((id) => references.get(id) as Dataset));
  const pk = definition.keyColumns;
  const fk = definition.referenceKeyColumns;
  const wanted = mergeColumns(fk, definition.columnsToBring);

  let base = dataset;
  if (dataset.rows.length === 0) {
    const projected = wanted.filter((c) => reference.columns.includes(c));
    const rename = new Map(fk.map((column, index) => [column, pk[index]]));
    const columns = mergeColumns(projected.map((c) => rename.get(c) ?? c));
    const rows = reference.rows.map((row) => {
      const out: Row = {};
      for (const column of projected) out[rename.get(column) ?? column] = value(row, column);
      return out;
    });
    base = { columns, rows };
  }

  const missingFk = fk.filter((c) => !reference.columns.includes(c));
  if (missingFk.length > 0) {
    warnings.push(`Chaves ausentes na referência: ${missingFk.join(', ')}; junção não aplicada.`);
    return { dataset: ensureColumns(base, definition.columnsToBring), affectedRows: 0, warnings };
  }

  const outcome =
    definition.matchMode === 'NORMALIZED'
      ? lookupNormalized(base, reference, pk, fk, wanted)
      : lookupExact(base, reference, pk, fk, definition.columnsToBring, maxRows);
  return { dataset: ensureColumns(outcome.dataset, definition.columnsToBring), affectedRows: outcome.affectedRows, warnings };
}

function ensureColumns(dataset: Dataset, columns: readonly string[]): Dataset {
  const missing = columns.filter((c) => !dataset.columns.includes(c));
  if (missing.length === 0) return dataset;
  return {
    columns: [...dataset.columns, ...missing],
    rows: dataset.rows.map((row) => {
      const next: Row = { ...row };
      for (const column of missing) if (!(column in next)) next[column] = null;
      return next;
    }),
  };
}

function lookupExact(
  base: Dataset,
  reference: Dataset,
  pk: readonly string[],
  fk: readonly string[],
  columnsToBring: readonly string[],
  maxRows: number,
): { dataset: Dataset; affectedRows: number } {
  const seenRaw = new Set<string>();
  const byKey = new Map<string, Row[]>();
  for (const row of reference.rows) {
    const raw = rawKey(row, fk);
    if (seenRaw.has(raw)) continue;
    seenRaw.add(raw);
    const key = normalizedKey(row, fk);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  const baseColumns = mergeColumns(base.columns, pk);
  const toAdd = columnsToBring.filter((c) => !fk.includes(c) && !baseColumns.includes(c));
  let affected = 0;
  const rows: Row[] = [];
  for (const row of base.rows) {
    const safe: Row = { ...row };
    for (const column of pk) if (!(column in safe)) safe[column] = null;
    const matches = byKey.get(normalizedKey(safe, pk));
    if (!matches || matches.length === 0) {
      const out: Row = { ...safe };
      for (const column of toAdd) out[column] = null;
      rows.push(out);
      continue;
    }
    affected += 1;
    if (toAdd.length === 0) {
      // Nothing to expand: the original removes the nested join column, so rows are not duplicated.
      rows.push(safe);
      continue;
    }
    for (const match of matches) {
      const out: Row = { ...safe };
      for (const column of toAdd) out[column] = value(match, column);
      rows.push(out);
      // Duplicated keys can multiply rows: stop before the result outgrows the limit.
      if (rows.length > maxRows) throw new RowLimitExceededError(rows.length);
    }
  }
  return { dataset: { columns: [...baseColumns, ...toAdd], rows }, affectedRows: affected };
}

function lookupNormalized(
  base: Dataset,
  reference: Dataset,
  pk: readonly string[],
  fk: readonly string[],
  wanted: readonly string[],
): { dataset: Dataset; affectedRows: number } {
  const byKey = new Map<string, Row>();
  for (const row of reference.rows) {
    const key = normalizedKey(row, fk);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  let affected = 0;
  const rows = base.rows.map((row) => {
    const match = byKey.get(normalizedKey(row, pk));
    const blankKey = match ? fk.every((c) => isBlank(value(match, c))) : false;
    const out: Row = {};
    for (const column of base.columns) if (!wanted.includes(column)) out[column] = value(row, column);
    let changed = false;
    for (const column of wanted) {
      const current = value(row, column);
      if (!isBlank(current)) {
        out[column] = current;
        continue;
      }
      const fromReference = match ? (blankKey ? NO_DATA_TOKEN : value(match, column)) : null;
      if (fromReference !== current) changed = true;
      out[column] = fromReference;
    }
    if (changed) affected += 1;
    return out;
  });
  const columns = [...base.columns.filter((c) => !wanted.includes(c)), ...wanted];
  return { dataset: { columns, rows }, affectedRows: affected };
}

/** Colunas Finais / Renomeadas: selects, orders and renames the existing columns. */
export function applyProjection(dataset: Dataset, definition: ProjectionDefinition): OperationOutcome {
  const present = definition.columns.filter((c) => dataset.columns.includes(c.source));
  const missing = definition.columns.filter((c) => !dataset.columns.includes(c.source)).map((c) => c.source);
  const warnings = missing.length > 0 ? [`Colunas inexistentes ignoradas na projeção: ${missing.join(', ')}.`] : [];
  const rows = dataset.rows.map((row) => {
    const out: Row = {};
    for (const column of present) out[column.as] = value(row, column.source);
    return out;
  });
  return { dataset: { columns: present.map((c) => c.as), rows }, affectedRows: rows.length, warnings };
}
