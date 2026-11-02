import type { PageRequest } from '../../../shared/domain/pagination';
import { InputValidator, queryObject } from '../../../shared/validation/input';
import type { AuditFilter, AuditOutcome } from '../application/audit-query.service';

const OUTCOMES: readonly AuditOutcome[] = ['SUCCESS', 'FAILURE', 'DENIED'];
const CODE = /^[A-Z][A-Z0-9_]{1,99}$/;
const ENTITY = /^[A-Za-z][A-Za-z0-9]{1,49}$/;

export function parseListAuditQuery(query: unknown): { filter: AuditFilter; page: PageRequest } {
  const v = new InputValidator();
  const q = queryObject(v, query, ['actorUserId', 'action', 'entityType', 'entityId', 'outcome', 'from', 'to']);
  const filter: AuditFilter = {
    actorUserId: v.uuid(q.actorUserId, 'actorUserId'),
    action: v.string(q.action, 'action', { max: 100, pattern: CODE, patternMessage: 'Ação inválida (ex.: RULE_UPDATED).' }),
    entityType: v.string(q.entityType, 'entityType', { max: 50, pattern: ENTITY, patternMessage: 'Tipo de entidade inválido (ex.: Rule).' }),
    entityId: v.string(q.entityId, 'entityId', { max: 64 }),
    outcome: v.enumValue(q.outcome, 'outcome', OUTCOMES),
    from: v.dateTime(q.from, 'from'),
    to: v.dateTime(q.to, 'to'),
  };
  if (filter.from && filter.to && filter.from >= filter.to) v.issue('to', 'Deve ser posterior a "from".', 'OUT_OF_RANGE');
  const page = v.page(q);
  v.assert('Parâmetros de consulta inválidos.');
  return { filter, page };
}
