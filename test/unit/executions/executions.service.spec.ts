import { ExecutionRunner } from '../../../src/modules/executions/application/execution-runner';
import { ExecutionsService } from '../../../src/modules/executions/application/executions.service';
import { ENGINE_VERSION } from '../../../src/modules/rules/domain/engine/rule-engine';
import { JobInterruptedError } from '../../../src/shared/application/jobs';
import { ConflictError, UnprocessableError, ValidationError } from '../../../src/shared/domain/errors';
import { failure, FakeAudit, FakeJobs, FakeNotifications, FakeTransactions, FixedClock, principal, uuid } from '../../support/fakes';
import { InMemoryExecutionData, InMemoryExecutions } from '../../support/in-memory-executions';
import { InMemoryRules } from '../../support/in-memory-rules';
import { InMemorySources, sourceView } from '../../support/in-memory-sources';

const operator = principal(['OPERATIONS']);
const condition = (column: string, value: string) => ({ column, operator: 'EQUALS' as const, values: [value], normalization: [], compareAs: 'AUTO' as const });

function setup() {
  const executions = new InMemoryExecutions();
  const data = new InMemoryExecutionData();
  const rules = new InMemoryRules();
  const sources = new InMemorySources();
  const transactions = new FakeTransactions();
  const jobs = new FakeJobs();
  const audit = new FakeAudit();
  const notifications = new FakeNotifications();
  const clock = new FixedClock();
  const target = sources.add(sourceView({ code: 'NOTAS' }));
  const reference = sources.add(sourceView({ code: 'FORNECEDORES' }));
  const importId = data.addImport(target.id, {
    columns: ['NF', 'STATUS', 'FORNECEDOR'],
    rows: [
      { NF: '1', STATUS: 'OK', FORNECEDOR: 'A' },
      { NF: '2', STATUS: 'ERRO', FORNECEDOR: 'B' },
    ],
  });
  const referenceImportId = data.addImport(reference.id, { columns: ['CODIGO', 'NOME'], rows: [{ CODIGO: 'A', NOME: 'Alfa' }] });
  const filter = rules.seed('FILTER', target.id, { name: 'Somente OK', description: null, phase: null, executionOrder: 1, definition: { condition: condition('STATUS', 'OK') } });
  const lookup = rules.seed('LOOKUP', target.id, {
    name: 'Nome do fornecedor',
    description: null,
    phase: null,
    executionOrder: 1,
    definition: { keyColumns: ['FORNECEDOR'], referenceSourceIds: [reference.id], referenceKeyColumns: ['CODIGO'], columnsToBring: ['NOME'], matchMode: 'EXACT' },
  });
  rules.seed('FILTER', target.id, { name: 'Fase X', description: null, phase: 'X', executionOrder: 1, definition: { condition: condition('NF', '1') } });
  const service = new ExecutionsService(executions, data, rules, sources, transactions, jobs, audit);
  const runner = new ExecutionRunner(executions, data, rules, sources, transactions, audit, notifications, clock, { maxRows: 1000 });
  return { executions, data, rules, sources, jobs, audit, notifications, target, reference, importId, referenceImportId, filter, lookup, service, runner };
}

describe('ExecutionsService.request', () => {
  it('pins the latest validated imports and the exact current rule versions', async () => {
    const { service, target, importId, referenceImportId, reference, filter, lookup, jobs, audit, executions } = setup();
    const { execution, replayed } = await service.request(operator, { sourceId: target.id, phase: null }, 'chave-0001');
    expect(replayed).toBe(false);
    expect(execution.status).toBe('QUEUED');
    expect(execution.engineVersion).toBe(ENGINE_VERSION);
    expect(execution.inputSnapshot).toEqual({
      primaryImportId: importId,
      referenceImports: [{ sourceId: reference.id, importId: referenceImportId }],
      // Engine order: LOOKUP (stage 10) before FILTER (stage 50); the phase-X rule is excluded.
      rules: [
        { ruleId: lookup.id, ruleVersionId: lookup.current.id, version: 1 },
        { ruleId: filter.id, ruleVersionId: filter.current.id, version: 1 },
      ],
    });
    expect(jobs.jobs).toEqual([{ type: 'RUN_EXECUTION', payload: { executionId: execution.id }, inTransaction: true }]);
    expect(audit.actions()).toEqual(['EXECUTION_REQUESTED']);
    expect(executions.logs.get(execution.id)![0].step).toBe('QUEUED');
  });

  it('is idempotent per user and key: same request replays, different request conflicts', async () => {
    const { service, target, jobs } = setup();
    const first = await service.request(operator, { sourceId: target.id, phase: null }, 'chave-0001');
    const again = await service.request(operator, { sourceId: target.id, phase: null }, 'chave-0001');
    expect(again).toEqual({ execution: first.execution, replayed: true });
    expect(jobs.jobs).toHaveLength(1);
    const conflict = await failure(service.request(operator, { sourceId: target.id, phase: 'X' }, 'chave-0001'));
    expect(conflict).toBeInstanceOf(ConflictError);
    expect(conflict.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('resolves a concurrent duplicate idempotency key by replaying the winner', async () => {
    const { service, target, executions } = setup();
    const winner = (await service.request(operator, { sourceId: target.id, phase: null }, 'chave-0002')).execution;
    executions.executions.delete(winner.id);
    executions.raceWith = winner;
    const result = await service.request(operator, { sourceId: target.id, phase: null }, 'chave-0002');
    expect(result).toEqual({ execution: winner, replayed: true });
  });

  it('explains why an execution cannot be requested', async () => {
    const { service, target, data, sources, reference } = setup();
    const withoutRules = sources.add(sourceView({ code: 'SEM_REGRAS' }));
    data.addImport(withoutRules.id, { columns: ['A'], rows: [{ A: '1' }] });
    expect((await failure(service.request(operator, { sourceId: withoutRules.id, phase: null }, null))).code).toBe('NO_ACTIVE_RULES');
    const other = sources.add(sourceView({ code: 'VAZIA' }));
    expect((await failure(service.request(operator, { sourceId: other.id, phase: null }, null))).code).toBe('NO_VALIDATED_IMPORT');
    const rejected = data.addImport(target.id, { columns: [], rows: [] }, 'REJECTED');
    const notValidated = await failure(service.request(operator, { sourceId: target.id, phase: null, importId: rejected }, null));
    expect(notValidated).toBeInstanceOf(UnprocessableError);
    expect(notValidated.code).toBe('IMPORT_NOT_VALIDATED');
    const unused = await failure(service.request(operator, { sourceId: target.id, phase: null, referenceImportIds: { [uuid(1)]: uuid(2) } }, null));
    expect(unused).toBeInstanceOf(ValidationError);
    for (const id of [...data.imports.keys()]) if (data.imports.get(id)!.sourceId === reference.id) data.imports.delete(id);
    expect((await failure(service.request(operator, { sourceId: target.id, phase: null }, null))).code).toBe('REFERENCE_IMPORT_MISSING');
  });
});

describe('ExecutionRunner', () => {
  it('applies the pinned rules and writes the report atomically with SUCCEEDED', async () => {
    const { service, runner, target, executions, data, notifications, audit } = setup();
    const { execution } = await service.request(operator, { sourceId: target.id, phase: null }, null);
    await runner.run(execution.id);
    const done = executions.executions.get(execution.id)!;
    expect(done.status).toBe('SUCCEEDED');
    expect(done.rowsIn).toBe(2);
    expect(done.rowsOut).toBe(1);
    expect(data.reports[0].dataset.rows).toEqual([{ NF: '1', STATUS: 'OK', FORNECEDOR: 'A', NOME: 'Alfa' }]);
    expect(notifications.sent).toEqual([expect.objectContaining({ type: 'EXECUTION_SUCCEEDED', inTransaction: true })]);
    expect(audit.actions()).toContain('EXECUTION_SUCCEEDED');
    const steps = executions.logs.get(execution.id)!.map((log) => log.step);
    expect(steps).toEqual(['QUEUED', 'START', 'INPUTS_LOADED', 'RULE 1/2', 'RULE 2/2', 'DONE']);
  });

  it('reruns with the same pinned versions even after the rule changed', async () => {
    const { service, runner, target, executions, rules, filter, data } = setup();
    const first = (await service.request(operator, { sourceId: target.id, phase: null }, null)).execution;
    await runner.run(first.id);
    await rules.addVersion(filter.id, 1, { ...filter.current, definition: { condition: condition('STATUS', 'ERRO') } }, 'mudança', operator.userId);
    const rerun = (await service.rerun(operator, first.id, null)).execution;
    expect(rerun.reproducedFromId).toBe(first.id);
    expect(rerun.inputSnapshot).toEqual(first.inputSnapshot);
    await runner.run(rerun.id);
    expect(executions.executions.get(rerun.id)!.status).toBe('SUCCEEDED');
    expect(data.reports[1].dataset.rows).toEqual(data.reports[0].dataset.rows);
  });

  it('fails without retry when a step exceeds the row limit', async () => {
    const context = setup();
    const runner = new ExecutionRunner(
      context.executions, context.data, context.rules, context.sources, new FakeTransactions(), context.audit, context.notifications, new FixedClock(), { maxRows: 1 },
    );
    const { execution } = await context.service.request(operator, { sourceId: context.target.id, phase: null }, null);
    await runner.run(execution.id);
    const failed = context.executions.executions.get(execution.id)!;
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('ROW_LIMIT_EXCEEDED');
    expect(context.notifications.sent[0].type).toBe('EXECUTION_FAILED');
  });

  it('cancels cooperatively and refuses to cancel finished executions', async () => {
    const { service, runner, target, executions } = setup();
    const queued = (await service.request(operator, { sourceId: target.id, phase: null }, null)).execution;
    expect((await service.cancel(queued.id)).status).toBe('CANCELLED');
    await runner.run(queued.id);
    expect(executions.executions.get(queued.id)!.status).toBe('CANCELLED');
    expect((await failure(service.cancel(queued.id))).code).toBe('INVALID_EXECUTION_TRANSITION');

    const running = (await service.request(operator, { sourceId: target.id, phase: null }, null)).execution;
    await executions.markRunning(running.id, new Date(), ENGINE_VERSION);
    const requested = await service.cancel(running.id);
    expect(requested).toEqual(expect.objectContaining({ status: 'RUNNING', cancelRequested: true }));
    await runner.run(running.id);
    expect(executions.executions.get(running.id)!.status).toBe('CANCELLED');
  });

  it('releases the job when the worker is shutting down', async () => {
    const { service, runner, target, executions } = setup();
    const { execution } = await service.request(operator, { sourceId: target.id, phase: null }, null);
    const error = await failure(runner.run(execution.id, { shuttingDown: () => true }));
    expect(error).toBeInstanceOf(JobInterruptedError);
    expect(executions.executions.get(execution.id)!.status).toBe('RUNNING');
  });

  it('fails with INPUT_UNAVAILABLE when a pinned rule version disappeared', async () => {
    const { service, runner, target, executions, rules } = setup();
    const { execution } = await service.request(operator, { sourceId: target.id, phase: null }, null);
    rules.rules.clear();
    await runner.run(execution.id);
    expect(executions.executions.get(execution.id)!.errorCode).toBe('INPUT_UNAVAILABLE');
  });
});
