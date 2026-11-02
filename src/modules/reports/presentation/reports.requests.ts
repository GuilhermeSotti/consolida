import type { PageRequest } from '../../../shared/domain/pagination';
import { InputValidator, queryObject } from '../../../shared/validation/input';
import type { ExportFormat, ReportFilter } from '../application/ports';

export function parseListReportsQuery(query: unknown): { filter: ReportFilter; page: PageRequest } {
  const v = new InputValidator();
  const q = queryObject(v, query, ['sourceId', 'executionId', 'from', 'to']);
  const filter: ReportFilter = {
    sourceId: v.uuid(q.sourceId, 'sourceId'),
    executionId: v.uuid(q.executionId, 'executionId'),
    from: v.dateTime(q.from, 'from'),
    to: v.dateTime(q.to, 'to'),
  };
  if (filter.from && filter.to && filter.from >= filter.to) v.issue('to', 'Deve ser posterior a "from".', 'OUT_OF_RANGE');
  const page = v.page(q);
  v.assert('Parâmetros de consulta inválidos.');
  return { filter, page };
}

export function parseExportQuery(query: unknown): ExportFormat {
  const v = new InputValidator();
  const q = v.object(query ?? {}, 'query', ['format']);
  const format = v.enumValue(q.format, 'format', ['csv', 'xlsx'] as const) ?? 'csv';
  v.assert('Parâmetros de consulta inválidos.');
  return format;
}
