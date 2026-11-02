import type { AuditRecorder, TransactionRunner } from '../../../shared/application/ports';
import { ConflictError, NotFoundError, UnprocessableError, ValidationError } from '../../../shared/domain/errors';
import { canonicalJson } from '../../../shared/domain/hashing';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Principal } from '../../auth/domain/access-control';
import type { SourcesRepository } from '../../sources/application/ports';
import { referencedSourceIds, type RuleDefinition, type RuleType } from '../domain/rule-definition';
import { parseRuleDefinition } from '../domain/rule-definition.parser';
import type { RuleContent, RuleFilter, RulesRepository, RuleStatus, RuleVersionView, RuleView } from './ports';

export interface CreateRuleCommand {
  type: RuleType;
  targetSourceId: string;
  name: string;
  description: string | null;
  phase: string | null;
  executionOrder: number;
  /** Raw definition (validated here against the rule type). */
  definition: unknown;
  changeReason: string | null;
}

export interface UpdateRuleCommand {
  expectedVersion: number;
  name?: string;
  description?: string | null;
  phase?: string | null;
  executionOrder?: number;
  definition?: unknown;
  changeReason: string;
}

/**
 * Rule registration with immutable versioning: every change creates version N+1 (the previous
 * versions stay untouched and keep being referenced by past executions). Updates require the
 * caller's `expectedVersion` (optimistic concurrency → 409 on conflict).
 */
export class RulesService {
  constructor(
    private readonly rules: RulesRepository,
    private readonly sources: SourcesRepository,
    private readonly transactions: TransactionRunner,
    private readonly audit: AuditRecorder,
  ) {}

  list(filter: RuleFilter, page: PageRequest): Promise<Page<RuleView>> {
    return this.rules.list(filter, page);
  }

  async get(id: string): Promise<RuleView> {
    const rule = await this.rules.findById(id);
    if (!rule) throw new NotFoundError('Rule', id);
    return rule;
  }

  async listVersions(id: string, page: PageRequest): Promise<Page<RuleVersionView>> {
    await this.get(id);
    return this.rules.listVersions(id, page);
  }

  async getVersion(id: string, version: number): Promise<RuleVersionView> {
    const found = await this.rules.findVersion(id, version);
    if (!found) throw new NotFoundError('RuleVersion', `${id}@${version}`);
    return found;
  }

  async create(actor: Principal, command: CreateRuleCommand): Promise<RuleView> {
    const definition = parseRuleDefinition(command.type, command.definition);
    await this.assertSources(command.targetSourceId, command.type, definition);
    return this.transactions.run(async (tx) => {
      const rule = await this.rules.create(
        {
          type: command.type,
          targetSourceId: command.targetSourceId,
          name: command.name,
          description: command.description,
          phase: command.phase,
          executionOrder: command.executionOrder,
          definition,
          changeReason: command.changeReason,
        },
        actor.userId,
        tx,
      );
      await this.audit.record(
        {
          action: 'RULE_CREATED',
          entityType: 'Rule',
          entityId: rule.id,
          outcome: 'SUCCESS',
          details: { type: rule.type, targetSourceId: rule.targetSourceId, version: 1, name: command.name },
        },
        tx,
      );
      return rule;
    });
  }

  async update(actor: Principal, id: string, command: UpdateRuleCommand): Promise<RuleView> {
    const rule = await this.get(id);
    if (rule.currentVersion !== command.expectedVersion) throw this.versionConflict(rule.currentVersion);
    const current = rule.current;
    const definition = command.definition === undefined ? current.definition : parseRuleDefinition(rule.type, command.definition);
    const next: RuleContent = {
      name: command.name ?? current.name,
      description: command.description !== undefined ? command.description : current.description,
      phase: command.phase !== undefined ? command.phase : current.phase,
      executionOrder: command.executionOrder ?? current.executionOrder,
      definition,
    };
    const changedFields: string[] = (['name', 'description', 'phase', 'executionOrder'] as const).filter((field) => next[field] !== current[field]);
    if (canonicalJson(next.definition) !== canonicalJson(current.definition)) changedFields.push('definition');
    if (changedFields.length === 0) {
      throw new ConflictError('RULE_UNCHANGED', 'Nenhuma alteração em relação à versão atual.');
    }
    if (command.definition !== undefined) await this.assertSources(rule.targetSourceId, rule.type, definition);

    return this.transactions.run(async (tx) => {
      const applied = await this.rules.addVersion(id, command.expectedVersion, next, command.changeReason, actor.userId, tx);
      if (!applied) {
        const latest = await this.rules.findById(id, tx);
        throw this.versionConflict(latest?.currentVersion ?? command.expectedVersion);
      }
      await this.audit.record(
        {
          action: 'RULE_UPDATED',
          entityType: 'Rule',
          entityId: id,
          outcome: 'SUCCESS',
          details: { fromVersion: command.expectedVersion, toVersion: command.expectedVersion + 1, changedFields, changeReason: command.changeReason },
        },
        tx,
      );
      const updated = await this.rules.findById(id, tx);
      if (!updated) throw new NotFoundError('Rule', id);
      return updated;
    });
  }

  setStatus(id: string, status: RuleStatus): Promise<RuleView> {
    return this.transactions.run(async (tx) => {
      const rule = await this.rules.findById(id, tx);
      if (!rule) throw new NotFoundError('Rule', id);
      if (rule.status === status) return rule;
      await this.rules.setStatus(id, status, tx);
      await this.audit.record(
        {
          action: status === 'ACTIVE' ? 'RULE_ACTIVATED' : 'RULE_DEACTIVATED',
          entityType: 'Rule',
          entityId: id,
          outcome: 'SUCCESS',
          details: { version: rule.currentVersion },
        },
        tx,
      );
      return { ...rule, status };
    });
  }

  private async assertSources(targetSourceId: string, type: RuleType, definition: RuleDefinition): Promise<void> {
    const references = referencedSourceIds(type, definition);
    if (references.includes(targetSourceId)) {
      throw new ValidationError('Definição de regra inválida.', [
        { field: 'definition.referenceSourceIds', message: 'A fonte de referência não pode ser a própria fonte-alvo.', code: 'SELF_REFERENCE' },
      ], 'INVALID_RULE_DEFINITION');
    }
    const wanted = [targetSourceId, ...references];
    const existing = new Set(await this.sources.existingIds(wanted));
    if (!existing.has(targetSourceId)) {
      throw new UnprocessableError('TARGET_SOURCE_NOT_FOUND', 'A fonte-alvo informada não existe.', [{ field: 'targetSourceId', message: targetSourceId }]);
    }
    const missing = references.filter((sourceId) => !existing.has(sourceId));
    if (missing.length > 0) {
      throw new UnprocessableError(
        'REFERENCE_SOURCE_NOT_FOUND',
        'Fonte(s) de referência inexistente(s).',
        missing.map((sourceId) => ({ field: 'definition.referenceSourceIds', message: sourceId })),
      );
    }
  }

  private versionConflict(currentVersion: number): ConflictError {
    return new ConflictError('RULE_VERSION_CONFLICT', 'A regra foi alterada por outra pessoa. Recarregue e tente novamente.', [
      { field: 'expectedVersion', message: `Versão atual: ${currentVersion}.`, code: 'STALE_VERSION' },
    ]);
  }
}
