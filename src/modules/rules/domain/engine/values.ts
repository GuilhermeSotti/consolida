import type { Scalar } from '../../../../shared/domain/tabular';

/**
 * Value semantics of the rule engine. Each function documents the Power Query (M) behaviour it
 * ports and any intentional divergence (see docs/regras/semantica-do-motor.md).
 */

/** Token used by the original `Matrix`/`normalizar` logic to represent blank join keys. */
export const BLANK_TOKEN = '__MATRIX_BLANK__';

/** M `isBlankValue`: null or text that is empty after trimming. Numbers/booleans are never blank. */
export function isBlank(value: Scalar | undefined): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** M `Text.From` with null → "" (used by text operators). Numbers use invariant formatting. */
export function toText(value: Scalar | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

/**
 * Numeric coercion. Accepts JS numbers and numeric strings in invariant (`1234.56`) or pt-BR
 * (`1.234,56`, `1234,56`) notation. A single separator is always read as the decimal separator.
 * Returns null when the value is not numeric.
 */
export function parseNumber(value: Scalar | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.replace(/\u00A0/g, '').trim();
  if (text === '') return null;
  let normalized: string | null = null;
  if (/^[+-]?\d+$/.test(text)) normalized = text;
  else if (/^[+-]?\d+[.,]\d+$/.test(text)) normalized = text.replace(',', '.');
  else if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) normalized = text.replace(/\./g, '').replace(',', '.');
  else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) normalized = text.replace(/,/g, '');
  if (normalized === null) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export const NORMALIZATION_MODES = [
  'DEFAULT',
  'TRIM',
  'REMOVE_SPECIAL_CHARACTERS',
  'LOWERCASE',
  'UPPERCASE',
  'TEXT_ONLY',
  'DIGITS_ONLY',
  'LENGTH',
] as const;
export type NormalizationMode = (typeof NORMALIZATION_MODES)[number];

/**
 * Port of M `Modo`: applies the modes in order to a value before comparison.
 *  DEFAULT ("padrão") · TRIM ("retirar espaços", trims both ends) ·
 *  REMOVE_SPECIAL_CHARACTERS ("retirar caracteres especiais", keeps [0-9A-Za-z]) ·
 *  LOWERCASE ("minúsculos") · UPPERCASE ("maiúsculos") ·
 *  TEXT_ONLY ("somente texto", keeps [A-Za-z0-9 ]) · DIGITS_ONLY ("somente número") ·
 *  LENGTH ("quantidade", text length as a number). Null stays null.
 */
export function normalize(value: Scalar, modes: readonly NormalizationMode[]): Scalar {
  let current: Scalar = value;
  for (const mode of modes) {
    if (mode === 'DEFAULT' || current === null) continue;
    const text = toText(current);
    switch (mode) {
      case 'TRIM':
        current = text.trim();
        break;
      case 'REMOVE_SPECIAL_CHARACTERS':
        current = text.replace(/[^0-9A-Za-z]/g, '');
        break;
      case 'LOWERCASE':
        current = text.toLowerCase();
        break;
      case 'UPPERCASE':
        current = text.toUpperCase();
        break;
      case 'TEXT_ONLY':
        current = text.replace(/[^A-Za-z0-9 ]/g, '');
        break;
      case 'DIGITS_ONLY':
        current = text.replace(/[^0-9]/g, '');
        break;
      case 'LENGTH':
        current = text.length;
        break;
    }
  }
  return current;
}

export const COMPARISON_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'LESS_THAN',
  'GREATER_OR_EQUAL',
  'LESS_OR_EQUAL',
  'CONTAINS',
  'NOT_CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

export const COMPARE_AS = ['AUTO', 'TEXT', 'NUMBER'] as const;
export type CompareAs = (typeof COMPARE_AS)[number];

function order(left: Scalar, right: Scalar, compareAs: CompareAs): number | null {
  if (compareAs !== 'TEXT') {
    const l = parseNumber(left);
    const r = parseNumber(right);
    if (l !== null && r !== null) return l === r ? 0 : l < r ? -1 : 1;
    if (compareAs === 'NUMBER') return null;
  }
  const l = toText(left);
  const r = toText(right);
  return l === r ? 0 : l < r ? -1 : 1;
}

/**
 * Port of M `Operador` (applied after `normalize` on both sides).
 * Divergences documented: values are compared numerically when both sides are numeric
 * (AUTO) instead of failing on mixed types; comparisons involving null are false except
 * EQUALS(null, null) and NOT_EQUALS(x, null).
 */
export function compare(left: Scalar, operator: ComparisonOperator, right: Scalar, compareAs: CompareAs): boolean {
  switch (operator) {
    case 'CONTAINS':
      return toText(left).includes(toText(right));
    case 'NOT_CONTAINS':
      return !toText(left).includes(toText(right));
    case 'STARTS_WITH':
      return toText(left).startsWith(toText(right));
    case 'ENDS_WITH':
      return toText(left).endsWith(toText(right));
    default:
      break;
  }
  if (left === null || right === null) {
    if (operator === 'EQUALS') return left === right;
    if (operator === 'NOT_EQUALS') return left !== right;
    return false;
  }
  const result = order(left, right, compareAs);
  if (result === null) return operator === 'NOT_EQUALS';
  switch (operator) {
    case 'EQUALS':
      return result === 0;
    case 'NOT_EQUALS':
      return result !== 0;
    case 'GREATER_THAN':
      return result > 0;
    case 'LESS_THAN':
      return result < 0;
    case 'GREATER_OR_EQUAL':
      return result >= 0;
    case 'LESS_OR_EQUAL':
      return result <= 0;
    default:
      return false;
  }
}

/**
 * Port of `normalizarValor` / `normalizeJoinValue`: blank → BLANK_TOKEN; numeric → canonical
 * number text; otherwise lower case without spaces, non-breaking spaces and dots.
 */
export function normalizeKeyValue(value: Scalar | undefined): string {
  if (isBlank(value)) return BLANK_TOKEN;
  const numeric = parseNumber(value ?? null);
  if (numeric !== null) return String(numeric);
  return toText(value ?? null)
    .trim()
    .replace(/[ \u00A0.]/g, '')
    .toLowerCase();
}

const ACCENT_MAP: ReadonlyArray<[string, string]> = [
  ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'], ['å', 'a'],
  ['ç', 'c'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'],
  ['ñ', 'n'],
  ['ý', 'y'], ['ÿ', 'y'],
  ['œ', 'oe'], ['æ', 'ae'],
  ['ß', 'ss'],
];

/** Port of `Padronizar` "limpar": lower case + accent folding (+ optional [a-z0-9 ] filter). */
export function cleanText(text: string, removeSpecialCharacters: boolean): string {
  let output = text.toLowerCase();
  for (const [from, to] of ACCENT_MAP) {
    output = output.split(from).join(to);
  }
  return removeSpecialCharacters ? output.replace(/[^a-z0-9 ]/g, '') : output;
}
