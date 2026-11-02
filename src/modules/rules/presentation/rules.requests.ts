import type { PageRequest } from '../../../shared/domain/pagination';
import { InputValidator, queryObject } from '../../../shared/validation/input';
import type { CreateRuleCommand, UpdateRuleCommand } from '../application/rules.service';
import type { RuleFilter, RuleStatus } from '../application/ports';
import { RULE_TYPES } from '../domain/rule-definition';
import { PHASE_PATTERN as PHASE } from '../../../shared/domain/phase';

const STATUSES: readonly RuleStatus[] = ['ACTIVE', 'INACTIVE'];
const MAX_ORDER = 1_000_000;

export function parseListRulesQuery(query: unknown): { filter: RuleFilter; page: PageRequest } {
  const v = new InputValidator();
  const q = queryObject(v, query, ['status', 'type', 'targetSourceId']);
  const filter: RuleFilter = {
    status: v.enumValue(q.status, 'status', STATUSES),
    type: v.enumValue(q.type, 'type', RULE_TYPES),
    targetSourceId: v.uuid(q.targetSourceId, 'targetSourceId'),
  };
  const page = v.page(q);
  v.assert('Parâmetros de consulta inválidos.');
  return { filter, page };
}

export function parseCreateRuleRequest(body: unknown): CreateRuleCommand {
  const v = new InputValidator();
  const o = v.object(body, 'body', ['type', 'targetSourceId', 'name', 'description', 'phase', 'executionOrder', 'definition', 'changeReason']);
  const command: CreateRuleCommand = {
    type: v.enumValue(o.type, 'type', RULE_TYPES, { required: true }),
    targetSourceId: v.uuid(o.targetSourceId, 'targetSourceId', { required: true }),
    name: v.string(o.name, 'name', { required: true, max: 200 }),
    description: v.nullableString(o.description, 'description', { max: 2000, multiline: true }) ?? null,
    phase: v.nullableString(o.phase, 'phase', { max: 100, pattern: PHASE, patternMessage: 'Use letras, dígitos, espaço, ".", "/", "_" ou "-".' }) ?? null,
    executionOrder: v.integer(o.executionOrder, 'executionOrder', { min: 0, max: MAX_ORDER }) ?? 0,
    definition: o.definition,
    changeReason: v.nullableString(o.changeReason, 'changeReason', { max: 500, multiline: true }) ?? null,
  };
  if (o.definition === undefined || o.definition === null) v.issue('definition', 'Campo obrigatório.', 'REQUIRED');
  v.assert();
  return command;
}

export function parseUpdateRuleRequest(body: unknown): UpdateRuleCommand {
  const v = new InputValidator();
  const o = v.object(body, 'body', ['expectedVersion', 'name', 'description', 'phase', 'executionOrder', 'definition', 'changeReason']);
  const command: UpdateRuleCommand = {
    expectedVersion: v.integer(o.expectedVersion, 'expectedVersion', { required: true, min: 1 }),
    changeReason: v.string(o.changeReason, 'changeReason', { required: true, min: 3, max: 500, multiline: true }),
  };
  if (o.name !== undefined) command.name = v.string(o.name, 'name', { required: true, max: 200 });
  if (o.description !== undefined) command.description = v.nullableString(o.description, 'description', { max: 2000, multiline: true }) ?? null;
  if (o.phase !== undefined) {
    command.phase = v.nullableString(o.phase, 'phase', { max: 100, pattern: PHASE, patternMessage: 'Use letras, dígitos, espaço, ".", "/", "_" ou "-".' }) ?? null;
  }
  if (o.executionOrder !== undefined) command.executionOrder = v.integer(o.executionOrder, 'executionOrder', { required: true, min: 0, max: MAX_ORDER });
  if (o.definition !== undefined) {
    if (o.definition === null) v.issue('definition', 'Não pode ser nulo.', 'REQUIRED');
    command.definition = o.definition;
  }
  v.assert();
  return command;
}

export function parseVersionParam(value: string): number {
  const v = new InputValidator();
  const version = v.integer(value, 'version', { required: true, coerce: true, min: 1, max: 1_000_000 });
  v.assert('Versão inválida.');
  return version;
}
