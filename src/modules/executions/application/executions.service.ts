import type { AuditRecorder, JobQueue, TransactionRunner } from '../../../shared/application/ports';
import { ConflictError, NotFoundError, UnprocessableError, ValidationError } from '../../../shared/domain/errors';
import { canonicalJson, sha256Hex } from '../../../shared/domain/hashing';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Principal } from '../../auth/domain/access-control';
import type { RulesRepository } from '../../rules/application/ports';
import { referencedSourceIds } from '../../rules/domain/rule-definition';
import { ENGINE_VERSION, sortRules } from '../../rules/domain/engine/rule-engine';
import type { SourcesRepository } from '../../sources/application/ports';
import { InputSnapshot, isTerminal } from '../domain/execution';
import {
  DuplicateIdempotencyKeyError,
  ExecutionDataStore,
  ExecutionFilter,
  ExecutionLogView,
  ExecutionsRepository,
  ExecutionView,
  ImportRef,
  NewExecution,
} from './ports';

export interface RequestExecutionCommand {
  sourceId: string;
  phase: string | null;
  /** Validated import to process; defaults to the most recent validated import of the source. */
  importId?: string;
  /** Overrides the reference import (by source id) used by LOOKUP rules. */
  referenceImportIds?: Record<string, string>;
}

export interface ExecutionRequestResult {
  execution: ExecutionView;
  /** True when an earlier request with the same Idempotency-Key was returned. */
  replayed: boolean;
}

/**
 * Requests, follows and controls executions. A request pins its inputs (validated imports and
 * the exact rule versions) in `inputSnapshot`, so the run — and any later re-run — is
 * reproducible regardless of later rule changes. Requests are idempotent per user and
 * `Idempotency-Key`.
 */
export class ExecutionsService {
  constructor(
    private readonly executions: ExecutionsRepository,
    private readonly data: ExecutionDataStore,
    private readonly rules: RulesRepository,
    private readonly sources: SourcesRepository,
    private readonly transactions: TransactionRunner,
    private readonly jobs: JobQueue,
    private readonly audit: AuditRecorder,
  ) {}

  list(filter: ExecutionFilter, page: PageRequest): Promise<Page<ExecutionView>> {
    return this.executions.list(filter, page);
  }

  async get(id: string): Promise<ExecutionView> {
    const execution = await this.executions.findById(id);
    if (!execution) throw new NotFoundError('Execution', id);
    return execution;
  }

  async logs(id: string, page: PageRequest): Promise<Page<ExecutionLogView>> {
    await this.get(id);
    return this.executions.listLogs(id, page);
  }

  async request(actor: Principal, command: RequestExecutionCommand, idempotencyKey: string | null): Promise<ExecutionRequestResult> {
    const requestHash = sha256Hex(
      canonicalJson({
        kind: 'execute',
        sourceId: command.sourceId,
        phase: command.phase,
        importId: command.importId ?? null,
        referenceImportIds: command.referenceImportIds ?? {},
      }),
    );
    const replay = await this.replay(actor.userId, idempotencyKey, requestHash);
    if (replay) return replay;

    const source = await this.sources.findById(command.sourceId);
    if (!source) throw new NotFoundError('Source', command.sourceId);
    if (source.status !== 'ACTIVE') throw new ConflictError('SOURCE_INACTIVE', 'A fonte está inativa.');

    const primary = command.importId
      ? await this.requireValidatedImport(command.importId, command.sourceId, 'importId')
      : await this.data.latestValidatedImport(command.sourceId);
    if (!primary) throw new UnprocessableError('NO_VALIDATED_IMPORT', 'A fonte não possui carga validada para processar.');

    const rules = sortRules(await this.rules.listExecutable(command.sourceId, command.phase));
    if (rules.length === 0) {
      throw new UnprocessableError('NO_ACTIVE_RULES', 'Não há regras ativas para esta fonte e fase.');
    }

    const referenced = [...new Set(rules.flatMap((rule) => referencedSourceIds(rule.type, rule.definition)))].sort();
    const overrides = command.referenceImportIds ?? {};
    const unused = Object.keys(overrides).filter((sourceId) => !referenced.includes(sourceId));
    if (unused.length > 0) {
      throw new ValidationError('Requisição inválida.', unused.map((sourceId) => ({
        field: `referenceImportIds.${sourceId}`,
        message: 'Nenhuma regra ativa usa esta fonte de referência.',
        code: 'UNUSED_REFERENCE',
      })));
    }
    const referenceImports: InputSnapshot['referenceImports'] = [];
    for (const sourceId of referenced) {
      const chosen = overrides[sourceId]
        ? await this.requireValidatedImport(overrides[sourceId], sourceId, `referenceImportIds.${sourceId}`)
        : await this.data.latestValidatedImport(sourceId);
      if (!chosen) {
        throw new UnprocessableError('REFERENCE_IMPORT_MISSING', 'Uma fonte de referência não possui carga validada.', [
          { field: 'referenceImportIds', message: sourceId },
        ]);
      }
      referenceImports.push({ sourceId, importId: chosen.id });
    }

    const inputSnapshot: InputSnapshot = {
      primaryImportId: primary.id,
      referenceImports,
      rules: rules.map((rule) => ({ ruleId: rule.ruleId, ruleVersionId: rule.ruleVersionId, version: rule.version })),
    };
    return this.enqueue(
      {
        sourceId: command.sourceId,
        phase: command.phase,
        requestedById: actor.userId,
        idempotencyKey,
        requestHash,
        engineVersion: ENGINE_VERSION,
        inputSnapshot,
        reproducedFromId: null,
      },
      'EXECUTION_REQUESTED',
    );
  }

  /** New execution with exactly the same pinned inputs (rule versions and imports). */
  async rerun(actor: Principal, id: string, idempotencyKey: string | null): Promise<ExecutionRequestResult> {
    const requestHash = sha256Hex(canonicalJson({ kind: 'rerun', executionId: id }));
    const replay = await this.replay(actor.userId, idempotencyKey, requestHash);
    if (replay) return replay;
    const original = await this.get(id);
    if (!isTerminal(original.status)) {
      throw new ConflictError('EXECUTION_NOT_FINISHED', 'Só é possível reprocessar execuções finalizadas.');
    }
    return this.enqueue(
      {
        sourceId: original.sourceId,
        phase: original.phase,
        requestedById: actor.userId,
        idempotencyKey,
        requestHash,
        engineVersion: ENGINE_VERSION,
        inputSnapshot: original.inputSnapshot,
        reproducedFromId: original.id,
      },
      'EXECUTION_RERUN_REQUESTED',
    );
  }

  async cancel(id: string): Promise<ExecutionView> {
    return this.transactions.run(async (tx) => {
      const execution = await this.executions.findById(id, tx);
      if (!execution) throw new NotFoundError('Execution', id);
      if (execution.status === 'QUEUED' && (await this.executions.markCancelled(id, ['QUEUED'], new Date(), tx))) {
        await this.executions.appendLog(id, { level: 'WARN', step: 'CANCEL', message: 'Execução cancelada antes do início.' }, tx);
        await this.audit.record({ action: 'EXECUTION_CANCELLED', entityType: 'Execution', entityId: id, outcome: 'SUCCESS' }, tx);
      } else if (execution.status === 'RUNNING' || execution.status === 'QUEUED') {
        if (!execution.cancelRequested && (await this.executions.requestCancel(id, tx))) {
          await this.executions.appendLog(id, { level: 'WARN', step: 'CANCEL', message: 'Cancelamento solicitado.' }, tx);
          await this.audit.record({ action: 'EXECUTION_CANCEL_REQUESTED', entityType: 'Execution', entityId: id, outcome: 'SUCCESS' }, tx);
        }
      } else {
        throw new ConflictError('INVALID_EXECUTION_TRANSITION', `Execução em ${execution.status} não pode ser cancelada.`);
      }
      const updated = await this.executions.findById(id, tx);
      if (!updated) throw new NotFoundError('Execution', id);
      return updated;
    });
  }

  private async replay(requestedById: string, key: string | null, requestHash: string): Promise<ExecutionRequestResult | null> {
    if (!key) return null;
    const existing = await this.executions.findByIdempotencyKey(requestedById, key);
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new ConflictError('IDEMPOTENCY_KEY_REUSED', 'A chave de idempotência já foi usada em uma requisição diferente.');
    }
    return { execution: existing, replayed: true };
  }

  private async enqueue(input: NewExecution, action: string): Promise<ExecutionRequestResult> {
    try {
      const execution = await this.transactions.run(async (tx) => {
        const created = await this.executions.create(input, tx);
        await this.jobs.enqueue({ type: 'RUN_EXECUTION', payload: { executionId: created.id } }, tx);
        await this.executions.appendLog(created.id, { level: 'INFO', step: 'QUEUED', message: 'Execução registrada na fila.' }, tx);
        await this.audit.record(
          {
            action,
            entityType: 'Execution',
            entityId: created.id,
            outcome: 'SUCCESS',
            details: {
              sourceId: input.sourceId,
              phase: input.phase,
              reproducedFromId: input.reproducedFromId,
              primaryImportId: input.inputSnapshot.primaryImportId,
              rules: input.inputSnapshot.rules.length,
            },
          },
          tx,
        );
        return created;
      });
      return { execution, replayed: false };
    } catch (error) {
      if (error instanceof DuplicateIdempotencyKeyError && input.idempotencyKey) {
        const replay = await this.replay(input.requestedById, input.idempotencyKey, input.requestHash);
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async requireValidatedImport(importId: string, sourceId: string, field: string): Promise<ImportRef> {
    const found = await this.data.findImport(importId);
    if (!found || found.sourceId !== sourceId) {
      throw new UnprocessableError('IMPORT_NOT_FOUND', 'Carga não encontrada para a fonte informada.', [{ field, message: importId }]);
    }
    if (found.status !== 'VALIDATED') {
      throw new UnprocessableError('IMPORT_NOT_VALIDATED', 'A carga informada não está validada.', [{ field, message: found.status }]);
    }
    return found;
  }
}
