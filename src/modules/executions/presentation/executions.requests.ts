import type { PageRequest } from '../../../shared/domain/pagination';
import { PHASE_PATTERN } from '../../../shared/domain/phase';
import { InputValidator, queryObject, UUID_PATTERN } from '../../../shared/validation/input';
import type { RequestExecutionCommand } from '../application/executions.service';
import type { ExecutionFilter } from '../application/ports';
import { EXECUTION_STATUSES } from '../domain/execution';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,100}$/;

export function parseIdempotencyKey(header: unknown): string | null {
  const v = new InputValidator();
  if (header === undefined || header === '') return null;
  const key = v.string(header, 'Idempotency-Key', {
    max: 100,
    pattern: IDEMPOTENCY_KEY,
    patternMessage: 'Use de 8 a 100 caracteres entre letras, dígitos, ".", "_", ":" ou "-".',
  });
  v.assert('Cabeçalho Idempotency-Key inválido.');
  return key ?? null;
}

export function parseRequestExecutionBody(body: unknown): RequestExecutionCommand {
  const v = new InputValidator();
  const o = v.object(body, 'body', ['sourceId', 'phase', 'importId', 'referenceImportIds']);
  const command: RequestExecutionCommand = {
    sourceId: v.uuid(o.sourceId, 'sourceId', { required: true }),
    phase: v.nullableString(o.phase, 'phase', { max: 100, pattern: PHASE_PATTERN, patternMessage: 'Fase inválida.' }) ?? null,
    importId: v.uuid(o.importId, 'importId'),
  };
  if (o.referenceImportIds !== undefined && o.referenceImportIds !== null) {
    const map = v.object(o.referenceImportIds, 'referenceImportIds', Object.keys(o.referenceImportIds as object));
    const entries = Object.entries(map);
    if (entries.length > 20) v.issue('referenceImportIds', 'No máximo 20 fontes de referência.', 'TOO_LONG');
    const overrides: Record<string, string> = {};
    for (const [sourceId, importId] of entries.slice(0, 20)) {
      if (!UUID_PATTERN.test(sourceId)) v.issue(`referenceImportIds.${sourceId}`, 'A chave deve ser o UUID da fonte.', 'INVALID_FORMAT');
      const parsed = v.uuid(importId, `referenceImportIds.${sourceId}`, { required: true });
      overrides[sourceId.toLowerCase()] = parsed;
    }
    command.referenceImportIds = overrides;
  }
  v.assert();
  return command;
}

export function parseListExecutionsQuery(query: unknown): { filter: ExecutionFilter; page: PageRequest } {
  const v = new InputValidator();
  const q = queryObject(v, query, ['status', 'sourceId', 'from', 'to']);
  const filter: ExecutionFilter = {
    status: v.enumValue(q.status, 'status', EXECUTION_STATUSES),
    sourceId: v.uuid(q.sourceId, 'sourceId'),
    from: v.dateTime(q.from, 'from'),
    to: v.dateTime(q.to, 'to'),
  };
  if (filter.from && filter.to && filter.from >= filter.to) v.issue('to', 'Deve ser posterior a "from".', 'OUT_OF_RANGE');
  const page = v.page(q);
  v.assert('Parâmetros de consulta inválidos.');
  return { filter, page };
}
