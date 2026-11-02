/**
 * Explicit, framework-free validation of untrusted input (request bodies and query strings).
 *
 * Each method records an issue (with the JSON path of the offending field) instead of throwing,
 * so a single response lists every problem. `assert()` throws a ValidationError when any issue
 * was recorded; values returned for invalid required fields are placeholders that never escape
 * because `assert()` runs before they are used.
 */
import { ErrorDetail, ValidationError } from '../domain/errors';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PageRequest } from '../domain/pagination';
import { hasDisallowedControlCharacters } from '../domain/text';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

export interface StringOptions {
  required?: boolean;
  /** Minimum length after trimming (default 1 when required). */
  min?: number;
  max: number;
  pattern?: RegExp;
  patternMessage?: string;
  /** Allows line breaks (multi-line descriptions). */
  multiline?: boolean;
}

export interface IntegerOptions {
  required?: boolean;
  min?: number;
  max?: number;
  /** Accepts numeric strings (query parameters). */
  coerce?: boolean;
}

export class InputValidator {
  private readonly problems: ErrorDetail[] = [];

  get issues(): readonly ErrorDetail[] {
    return this.problems;
  }

  get valid(): boolean {
    return this.problems.length === 0;
  }

  issue(field: string, message: string, code = 'INVALID_VALUE'): void {
    if (this.problems.length < 100) this.problems.push({ field, message, code });
  }

  assert(message = 'Requisição inválida.'): void {
    if (!this.valid) throw new ValidationError(message, [...this.problems]);
  }

  /** Requires a plain JSON object and rejects properties outside `allowedKeys`. */
  object(value: unknown, field: string, allowedKeys: readonly string[]): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.issue(field, 'Deve ser um objeto JSON.', 'INVALID_TYPE');
      return {};
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!allowedKeys.includes(key)) this.issue(join(field, key), 'Propriedade não permitida.', 'UNKNOWN_PROPERTY');
    }
    return record;
  }

  string(value: unknown, field: string, options: StringOptions & { required: true }): string;
  string(value: unknown, field: string, options: StringOptions): string | undefined;
  string(value: unknown, field: string, options: StringOptions): string | undefined {
    if (value === undefined || value === null) {
      if (options.required) this.issue(field, 'Campo obrigatório.', 'REQUIRED');
      return options.required ? '' : undefined;
    }
    if (typeof value !== 'string') {
      this.issue(field, 'Deve ser um texto.', 'INVALID_TYPE');
      return options.required ? '' : undefined;
    }
    const text = value.trim();
    const min = options.min ?? (options.required ? 1 : 0);
    if (text.length < min) {
      this.issue(field, min <= 1 ? 'Não pode ser vazio.' : `Deve ter ao menos ${min} caracteres.`, 'TOO_SHORT');
    } else if (text.length > options.max) {
      this.issue(field, `Deve ter no máximo ${options.max} caracteres.`, 'TOO_LONG');
    } else if (hasDisallowedControlCharacters(text) || (!options.multiline && /[\r\n]/.test(text))) {
      this.issue(field, 'Contém caracteres não permitidos.', 'INVALID_CHARACTERS');
    } else if (options.pattern && !options.pattern.test(text)) {
      this.issue(field, options.patternMessage ?? 'Formato inválido.', 'INVALID_FORMAT');
    }
    return text;
  }

  /**
   * Optional text that may be explicitly cleared: `undefined` = not informed (keep),
   * `null` or blank = clear.
   */
  nullableString(value: unknown, field: string, options: Omit<StringOptions, 'required'>): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
    return this.string(value, field, { ...options, required: false, min: options.min ?? 1 }) ?? null;
  }

  integer(value: unknown, field: string, options: IntegerOptions & { required: true }): number;
  integer(value: unknown, field: string, options?: IntegerOptions): number | undefined;
  integer(value: unknown, field: string, options: IntegerOptions = {}): number | undefined {
    if (value === undefined || value === null || value === '') {
      if (options.required) this.issue(field, 'Campo obrigatório.', 'REQUIRED');
      return options.required ? 0 : undefined;
    }
    let number: number | undefined;
    if (typeof value === 'number') number = value;
    else if (options.coerce && typeof value === 'string' && /^-?\d{1,15}$/.test(value.trim())) number = Number(value.trim());
    if (number === undefined || !Number.isSafeInteger(number)) {
      this.issue(field, 'Deve ser um número inteiro.', 'INVALID_TYPE');
      return options.required ? 0 : undefined;
    }
    if (options.min !== undefined && number < options.min) this.issue(field, `Deve ser maior ou igual a ${options.min}.`, 'OUT_OF_RANGE');
    if (options.max !== undefined && number > options.max) this.issue(field, `Deve ser menor ou igual a ${options.max}.`, 'OUT_OF_RANGE');
    return number;
  }

  boolean(value: unknown, field: string, options: { required?: boolean; coerce?: boolean } = {}): boolean | undefined {
    if (value === undefined || value === null || value === '') {
      if (options.required) this.issue(field, 'Campo obrigatório.', 'REQUIRED');
      return undefined;
    }
    if (typeof value === 'boolean') return value;
    if (options.coerce && (value === 'true' || value === 'false')) return value === 'true';
    this.issue(field, 'Deve ser verdadeiro ou falso.', 'INVALID_TYPE');
    return undefined;
  }

  enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[], options: { required: true }): T;
  enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[], options?: { required?: boolean }): T | undefined;
  enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[], options: { required?: boolean } = {}): T | undefined {
    if (value === undefined || value === null || value === '') {
      if (options.required) this.issue(field, 'Campo obrigatório.', 'REQUIRED');
      return options.required ? allowed[0] : undefined;
    }
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
      this.issue(field, `Valor inválido. Permitidos: ${allowed.join(', ')}.`, 'INVALID_ENUM');
      return options.required ? allowed[0] : undefined;
    }
    return value as T;
  }

  uuid(value: unknown, field: string, options: { required: true }): string;
  uuid(value: unknown, field: string, options?: { required?: boolean }): string | undefined;
  uuid(value: unknown, field: string, options: { required?: boolean } = {}): string | undefined {
    if (value === undefined || value === null || value === '') {
      if (options.required) this.issue(field, 'Campo obrigatório.', 'REQUIRED');
      return options.required ? '' : undefined;
    }
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      this.issue(field, 'Deve ser um UUID.', 'INVALID_FORMAT');
      return options.required ? '' : undefined;
    }
    return value.toLowerCase();
  }

  dateTime(value: unknown, field: string): Date | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || !ISO_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
      this.issue(field, 'Deve ser uma data ISO 8601 (ex.: 2026-10-23 ou 2026-10-23T10:00:00Z).', 'INVALID_FORMAT');
      return undefined;
    }
    return new Date(value);
  }

  array<T>(
    value: unknown,
    field: string,
    options: { required?: boolean; min?: number; max: number },
    item: (entry: unknown, path: string) => T,
  ): T[] | undefined {
    if (value === undefined || value === null) {
      if (options.required) this.issue(field, 'Campo obrigatório.', 'REQUIRED');
      return options.required ? [] : undefined;
    }
    if (!Array.isArray(value)) {
      this.issue(field, 'Deve ser uma lista.', 'INVALID_TYPE');
      return options.required ? [] : undefined;
    }
    if (options.min !== undefined && value.length < options.min) this.issue(field, `Informe ao menos ${options.min} item(ns).`, 'TOO_SHORT');
    if (value.length > options.max) {
      this.issue(field, `Informe no máximo ${options.max} itens.`, 'TOO_LONG');
      return [];
    }
    return value.map((entry, index) => item(entry, `${field}[${index}]`));
  }

  /** `?page=&pageSize=` with bounds. */
  page(query: Record<string, unknown>): PageRequest {
    const page = this.integer(query.page, 'page', { coerce: true, min: 1, max: 1_000_000 }) ?? 1;
    const pageSize = this.integer(query.pageSize, 'pageSize', { coerce: true, min: 1, max: MAX_PAGE_SIZE }) ?? DEFAULT_PAGE_SIZE;
    return { page, pageSize };
  }
}

function join(parent: string, key: string): string {
  return parent === 'body' || parent === 'query' ? key : `${parent}.${key}`;
}

/** Validates a query string object against the allowed parameter names. */
export function queryObject(validator: InputValidator, query: unknown, allowed: readonly string[]): Record<string, unknown> {
  return validator.object(query ?? {}, 'query', ['page', 'pageSize', ...allowed]);
}

/** Query string that only accepts paging parameters. */
export function parsePageQuery(query: unknown): PageRequest {
  const validator = new InputValidator();
  const q = queryObject(validator, query, []);
  const page = validator.page(q);
  validator.assert('Parâmetros de consulta inválidos.');
  return page;
}
