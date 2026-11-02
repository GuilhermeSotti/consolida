import type { Row, Scalar } from '../../../shared/domain/tabular';

/**
 * CSV writer for report exports. Defaults target Excel pt-BR: `;` delimiter, CRLF and UTF-8 BOM.
 * Text cells starting with `=`, `+`, `-`, `@`, TAB or CR are prefixed with `'` to neutralize
 * spreadsheet formula injection (OWASP CSV Injection). Text containing ANY common separator
 * (`;` `,` TAB), quotes or line breaks is quoted, so a spreadsheet configured with a different
 * list separator cannot split a cell and expose a formula in the middle of it.
 * Numbers are written as numbers.
 */
export const CSV_BOM = '﻿';
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: Scalar, delimiter = ';'): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const safe = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  const needsQuotes = safe.includes(delimiter) || /[",;\t\r\n]/.test(safe) || safe !== safe.trim();
  return needsQuotes ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvHeader(columns: readonly string[], delimiter = ';'): string {
  return columns.map((column) => escapeCsvCell(column, delimiter)).join(delimiter) + '\r\n';
}

export function csvLines(columns: readonly string[], rows: readonly Row[], delimiter = ';'): string {
  let output = '';
  for (const row of rows) {
    output += columns.map((column) => escapeCsvCell(row[column] ?? null, delimiter)).join(delimiter) + '\r\n';
  }
  return output;
}
