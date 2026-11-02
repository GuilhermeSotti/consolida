import type { JobHandler } from '../shared/application/jobs';
import type { ExecutionRunner } from '../modules/executions/application/execution-runner';
import type { ImportProcessor } from '../modules/sources/application/import-processor';
import type { JobHandlers, WorkerState } from './job-runner.service';

function requireId(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`Invalid job payload: ${key}`);
  return value;
}

export function createJobHandlers(imports: ImportProcessor, executions: ExecutionRunner, state: WorkerState): JobHandlers {
  const processImport: JobHandler = {
    handle: (payload) => imports.process(requireId(payload, 'importId')),
    onExhausted: (payload) => imports.fail(requireId(payload, 'importId'), 'Falha inesperada no processamento da carga.'),
  };
  const runExecution: JobHandler = {
    handle: (payload) => executions.run(requireId(payload, 'executionId'), { shuttingDown: () => state.stopping }),
    onExhausted: (payload) => executions.failPermanently(requireId(payload, 'executionId')),
  };
  return { PROCESS_IMPORT: processImport, RUN_EXECUTION: runExecution };
}
