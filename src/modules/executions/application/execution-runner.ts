import { JobInterruptedError } from '../../../shared/application/jobs';
import type { AuditRecorder, Clock, NotificationPublisher, TransactionRunner } from '../../../shared/application/ports';
import { DomainError } from '../../../shared/domain/errors';
import type { Dataset } from '../../../shared/domain/tabular';
import type { RulesRepository } from '../../rules/application/ports';
import type { ExecutableRule } from '../../rules/domain/rule-definition';
import { ENGINE_VERSION, EngineCancelledError, EngineLimitError, runRules } from '../../rules/domain/engine/rule-engine';
import type { SourcesRepository } from '../../sources/application/ports';
import { isTerminal, parseInputSnapshot } from '../domain/execution';
import type { ExecutionDataStore, ExecutionLimits, ExecutionsRepository, ExecutionView } from './ports';

/** Business failure: the execution ends FAILED without retries. */
class ExecutionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutionFailure';
  }
}

export interface RunControl {
  /** True when the worker is shutting down (the run stops at the next rule boundary and is retried later). */
  shuttingDown(): boolean;
}

/**
 * Worker-side processing of RUN_EXECUTION jobs:
 *  load the pinned inputs → apply the rules (deterministic engine) → write the Consolidated
 *  Report and mark SUCCEEDED in ONE transaction (no partial report is ever visible).
 * Business problems end the execution as FAILED; unexpected errors are rethrown so the job is
 * retried (the run restarts from the pinned inputs, which are immutable).
 */
export class ExecutionRunner {
  constructor(
    private readonly executions: ExecutionsRepository,
    private readonly data: ExecutionDataStore,
    private readonly rules: RulesRepository,
    private readonly sources: SourcesRepository,
    private readonly transactions: TransactionRunner,
    private readonly audit: AuditRecorder,
    private readonly notifications: NotificationPublisher,
    private readonly clock: Clock,
    private readonly limits: ExecutionLimits,
  ) {}

  async run(executionId: string, control: RunControl = { shuttingDown: () => false }): Promise<void> {
    const execution = await this.executions.findById(executionId);
    if (!execution || isTerminal(execution.status)) return;
    if (execution.cancelRequested) {
      await this.finishCancelled(execution, 'Cancelada antes do processamento.');
      return;
    }
    const retry = execution.status === 'RUNNING';
    if (!(await this.executions.markRunning(executionId, this.clock.now(), ENGINE_VERSION))) return;
    await this.executions.appendLog(executionId, {
      level: retry ? 'WARN' : 'INFO',
      step: 'START',
      message: retry ? 'Execução reiniciada após interrupção do processamento anterior.' : 'Execução iniciada.',
      details: { engineVersion: ENGINE_VERSION, requestedEngineVersion: execution.engineVersion },
    });

    try {
      const snapshot = parseInputSnapshot(execution.inputSnapshot);
      await this.executions.updateProgress(executionId, { stage: 'LOADING', rulesApplied: 0, totalRules: snapshot.rules.length });
      const dataset = await this.loadImport(snapshot.primaryImportId);
      const references = new Map<string, Dataset>();
      for (const reference of snapshot.referenceImports) {
        references.set(reference.sourceId, await this.loadImport(reference.importId));
      }
      const rules = await this.loadRules(snapshot.rules.map((rule) => rule.ruleVersionId));
      await this.executions.updateProgress(executionId, { stage: 'APPLYING_RULES', rulesApplied: 0, totalRules: rules.length }, dataset.rows.length);
      await this.executions.appendLog(executionId, {
        level: 'INFO',
        step: 'INPUTS_LOADED',
        message: `Entradas carregadas: ${dataset.rows.length} linha(s), ${references.size} base(s) de referência, ${rules.length} regra(s).`,
      });

      let cancelRequested = false;
      const result = await runRules(
        { dataset, references, rules },
        {
          maxRows: this.limits.maxRows,
          shouldCancel: () => cancelRequested || control.shuttingDown(),
          onStep: async (step, index, total) => {
            await this.executions.appendLog(executionId, {
              level: step.warnings.length > 0 ? 'WARN' : 'INFO',
              step: `RULE ${index + 1}/${total}`,
              message: `${step.type} "${step.name}" (v${step.version}): ${step.rowsBefore} → ${step.rowsAfter} linha(s), ${step.affectedRows} afetada(s).`,
              details: { ...step },
            });
            await this.executions.updateProgress(executionId, { stage: 'APPLYING_RULES', rulesApplied: index + 1, totalRules: total });
            cancelRequested = await this.executions.isCancelRequested(executionId);
          },
        },
      );

      await this.executions.updateProgress(executionId, { stage: 'WRITING_REPORT', rulesApplied: rules.length, totalRules: rules.length });
      const source = await this.sources.findById(execution.sourceId);
      const finishedAt = this.clock.now();
      await this.transactions.run(
        async (tx) => {
          const reportId = await this.data.writeReport(
            {
              executionId,
              sourceId: execution.sourceId,
              name: `Relatório Consolidado — ${source?.code ?? execution.sourceId} — ${finishedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
              dataset: result.dataset,
              availableAt: finishedAt,
            },
            tx,
          );
          if (!(await this.executions.markSucceeded(executionId, { rowsOut: result.dataset.rows.length, totalRules: rules.length, finishedAt }, tx))) {
            throw new ExecutionFailure('STATE_CHANGED', 'A execução mudou de estado durante o processamento.');
          }
          await this.executions.appendLog(
            executionId,
            { level: 'INFO', step: 'DONE', message: `Relatório gerado com ${result.dataset.rows.length} linha(s).`, details: { reportId } },
            tx,
          );
          await this.notifications.notify(
            {
              userId: execution.requestedById,
              type: 'EXECUTION_SUCCEEDED',
              title: 'Execução concluída',
              message: `O Relatório Consolidado foi gerado com ${result.dataset.rows.length} linha(s).`,
              entityType: 'Execution',
              entityId: executionId,
            },
            tx,
          );
          await this.audit.record(
            {
              action: 'EXECUTION_SUCCEEDED',
              entityType: 'Execution',
              entityId: executionId,
              outcome: 'SUCCESS',
              actorUserId: null,
              details: { reportId, rowsIn: dataset.rows.length, rowsOut: result.dataset.rows.length },
            },
            tx,
          );
        },
        { timeoutMs: 10 * 60 * 1000 },
      );
    } catch (error) {
      if (error instanceof EngineCancelledError) {
        if (control.shuttingDown()) {
          await this.executions.appendLog(executionId, { level: 'WARN', step: 'INTERRUPTED', message: 'Processamento interrompido pelo desligamento do worker; será retomado.' });
          throw new JobInterruptedError();
        }
        await this.finishCancelled(execution, 'Execução cancelada a pedido do usuário.');
        return;
      }
      if (error instanceof EngineLimitError) {
        await this.finishFailed(execution, 'ROW_LIMIT_EXCEEDED', error.message);
        return;
      }
      if (error instanceof ExecutionFailure) {
        await this.finishFailed(execution, error.code, error.message);
        return;
      }
      if (error instanceof DomainError) {
        await this.finishFailed(execution, error.code, error.message);
        return;
      }
      throw error;
    }
  }

  /** Called by the job runner when all attempts failed with unexpected errors. */
  async failPermanently(executionId: string): Promise<void> {
    const execution = await this.executions.findById(executionId);
    if (!execution || isTerminal(execution.status)) return;
    await this.finishFailed(execution, 'INTERNAL_ERROR', 'Falha inesperada no processamento. A equipe de suporte foi registrada nos logs.');
  }

  private async loadImport(importId: string): Promise<Dataset> {
    const found = await this.data.findImport(importId);
    if (!found || found.status !== 'VALIDATED') {
      throw new ExecutionFailure('INPUT_UNAVAILABLE', `A carga ${importId} não está disponível.`);
    }
    return this.data.loadImportDataset(importId);
  }

  private async loadRules(versionIds: string[]): Promise<ExecutableRule[]> {
    const loaded = await this.rules.loadVersions(versionIds);
    const byId = new Map(loaded.map((rule) => [rule.ruleVersionId, rule]));
    const missing = versionIds.filter((id) => !byId.has(id));
    if (missing.length > 0) throw new ExecutionFailure('INPUT_UNAVAILABLE', `Versões de regra não encontradas: ${missing.join(', ')}.`);
    return versionIds.map((id) => byId.get(id) as ExecutableRule);
  }

  private async finishCancelled(execution: ExecutionView, message: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      if (!(await this.executions.markCancelled(execution.id, ['QUEUED', 'RUNNING'], this.clock.now(), tx))) return;
      await this.executions.appendLog(execution.id, { level: 'WARN', step: 'CANCELLED', message }, tx);
      await this.audit.record({ action: 'EXECUTION_CANCELLED', entityType: 'Execution', entityId: execution.id, outcome: 'SUCCESS', actorUserId: null }, tx);
    });
  }

  private async finishFailed(execution: ExecutionView, errorCode: string, errorMessage: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const finishedAt = this.clock.now();
      if (!(await this.executions.markFailed(execution.id, { errorCode, errorMessage: errorMessage.slice(0, 1000), finishedAt }, tx))) return;
      await this.executions.appendLog(execution.id, { level: 'ERROR', step: 'FAILED', message: errorMessage.slice(0, 1000), details: { errorCode } }, tx);
      await this.notifications.notify(
        {
          userId: execution.requestedById,
          type: 'EXECUTION_FAILED',
          title: 'Execução com falha',
          message: `A execução falhou (${errorCode}). Consulte os logs da execução.`,
          entityType: 'Execution',
          entityId: execution.id,
        },
        tx,
      );
      await this.audit.record(
        { action: 'EXECUTION_FAILED', entityType: 'Execution', entityId: execution.id, outcome: 'FAILURE', actorUserId: null, details: { errorCode } },
        tx,
      );
    });
  }
}
