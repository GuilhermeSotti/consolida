/**
 * Tabular data model shared by imports, the rule engine and reports.
 * Values are JSON scalars so that datasets can be persisted as JSONB without loss.
 */
export type Scalar = string | number | boolean | null;
export type Row = Record<string, Scalar>;

export interface Dataset {
  /** Ordered, canonical column names. */
  columns: string[];
  rows: Row[];
}

/**
 * Canonical column name — port of `Helper[NormalizeColumnNames]` (Sanitize) from the original
 * Power Query script: upper case, trimmed, spaces replaced by `_`, repeated/edge `_` collapsed.
 */
export function canonicalColumnName(name: unknown): string {
  const text = String(name ?? '').trim().toUpperCase();
  return text
    .replace(/ /g, '_')
    .split('_')
    .filter((part) => part !== '')
    .join('_');
}

/**
 * Canonicalizes a list of header names keeping them unique (port of `MakeUnique`): later
 * duplicates receive the first free suffix `_1`, `_2`, ... Empty names become `COLUMN_<n>`.
 */
export function canonicalColumnNames(names: readonly unknown[]): string[] {
  const result: string[] = [];
  const used = new Set<string>();
  names.forEach((raw, index) => {
    const base = canonicalColumnName(raw) || `COLUMN_${index + 1}`;
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    result.push(candidate);
  });
  return result;
}

/** Converts arbitrary parsed cell content to a JSON scalar. Dates become ISO strings. */
export function toScalar(value: unknown): Scalar {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  return String(value);
}

/** Returns the union of columns preserving first-seen order. */
export function mergeColumns(...lists: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const column of list) {
      if (!seen.has(column)) {
        seen.add(column);
        out.push(column);
      }
    }
  }
  return out;
}
