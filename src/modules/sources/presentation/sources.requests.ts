import type { PageRequest } from '../../../shared/domain/pagination';
import { InputValidator, queryObject } from '../../../shared/validation/input';
import type { CreateSourceCommand, ImportStatus, SourceFilter, UpdateSourceCommand } from '../application/ports';
import { CSV_DELIMITERS, FILE_FORMATS, parseSourceMetadata, SOURCE_CODE_PATTERN, SOURCE_STATUSES } from '../domain/source';
import { parseExpectedColumns } from '../domain/tabular-import';

const IMPORT_STATUSES: readonly ImportStatus[] = ['RECEIVED', 'PROCESSING', 'VALIDATED', 'REJECTED', 'FAILED'];
const SHEET_NAME = /^[^\\/?*[\]:]{1,31}$/;

export function parseListSourcesQuery(query: unknown): { filter: SourceFilter; page: PageRequest } {
  const v = new InputValidator();
  const q = queryObject(v, query, ['status', 'fileFormat', 'search']);
  const filter: SourceFilter = {
    status: v.enumValue(q.status, 'status', SOURCE_STATUSES),
    fileFormat: v.enumValue(q.fileFormat, 'fileFormat', FILE_FORMATS),
    search: v.string(q.search, 'search', { max: 100 }),
  };
  const page = v.page(q);
  v.assert('Parâmetros de consulta inválidos.');
  return { filter, page };
}

function expectedColumns(v: InputValidator, value: unknown) {
  const parsed = parseExpectedColumns(value ?? []);
  for (const issue of parsed.issues) v.issue(issue.field ?? 'expectedColumns', issue.message, issue.code ?? 'INVALID_VALUE');
  return parsed.columns;
}

function metadata(v: InputValidator, value: unknown) {
  const parsed = parseSourceMetadata(value);
  for (const issue of parsed.issues) v.issue(issue.field ?? 'metadata', issue.message, issue.code ?? 'INVALID_VALUE');
  return parsed.metadata;
}

export function parseCreateSourceRequest(body: unknown): CreateSourceCommand {
  const v = new InputValidator();
  const o = v.object(body, 'body', ['code', 'name', 'description', 'fileFormat', 'sheetName', 'csvDelimiter', 'expectedColumns', 'metadata']);
  const fileFormat = v.enumValue(o.fileFormat, 'fileFormat', FILE_FORMATS, { required: true });
  const command: CreateSourceCommand = {
    code: v.string(o.code, 'code', {
      required: true,
      max: 64,
      pattern: SOURCE_CODE_PATTERN,
      patternMessage: 'Use letras maiúsculas, dígitos, "_" ou "-" (2 a 64 caracteres).',
    }),
    name: v.string(o.name, 'name', { required: true, max: 200 }),
    description: v.nullableString(o.description, 'description', { max: 2000, multiline: true }) ?? null,
    fileFormat,
    sheetName: v.nullableString(o.sheetName, 'sheetName', { max: 31, pattern: SHEET_NAME, patternMessage: 'Nome de aba inválido.' }) ?? null,
    csvDelimiter: parseDelimiter(v, o.csvDelimiter) ?? null,
    expectedColumns: expectedColumns(v, o.expectedColumns),
    metadata: metadata(v, o.metadata),
  };
  if (fileFormat === 'CSV' && command.sheetName) v.issue('sheetName', 'Aplica-se somente a fontes XLSX.', 'NOT_APPLICABLE');
  if (fileFormat === 'XLSX' && command.csvDelimiter) v.issue('csvDelimiter', 'Aplica-se somente a fontes CSV.', 'NOT_APPLICABLE');
  v.assert();
  return command;
}

export function parseUpdateSourceRequest(body: unknown): UpdateSourceCommand {
  const v = new InputValidator();
  const o = v.object(body, 'body', ['name', 'description', 'sheetName', 'csvDelimiter', 'expectedColumns', 'metadata']);
  const changes: UpdateSourceCommand = {};
  if (o.name !== undefined) changes.name = v.string(o.name, 'name', { required: true, max: 200 });
  if (o.description !== undefined) changes.description = v.nullableString(o.description, 'description', { max: 2000, multiline: true }) ?? null;
  if (o.sheetName !== undefined) {
    changes.sheetName = v.nullableString(o.sheetName, 'sheetName', { max: 31, pattern: SHEET_NAME, patternMessage: 'Nome de aba inválido.' }) ?? null;
  }
  if (o.csvDelimiter !== undefined) changes.csvDelimiter = parseDelimiter(v, o.csvDelimiter) ?? null;
  if (o.expectedColumns !== undefined) changes.expectedColumns = expectedColumns(v, o.expectedColumns);
  if (o.metadata !== undefined) changes.metadata = metadata(v, o.metadata);
  if (Object.keys(changes).length === 0 && v.valid) v.issue('body', 'Informe ao menos um campo para alterar.', 'EMPTY_UPDATE');
  v.assert();
  return changes;
}

function parseDelimiter(v: InputValidator, value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return value === undefined ? undefined : null;
  if (typeof value !== 'string' || !(CSV_DELIMITERS as readonly string[]).includes(value)) {
    v.issue('csvDelimiter', 'Use ",", ";", "|" ou tabulação.', 'INVALID_ENUM');
    return undefined;
  }
  return value;
}

export function parseListImportsQuery(query: unknown): { status?: ImportStatus; page: PageRequest } {
  const v = new InputValidator();
  const q = queryObject(v, query, ['status']);
  const status = v.enumValue(q.status, 'status', IMPORT_STATUSES);
  const page = v.page(q);
  v.assert('Parâmetros de consulta inválidos.');
  return { status, page };
}
