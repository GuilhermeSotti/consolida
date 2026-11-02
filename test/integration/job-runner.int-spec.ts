/**
 * PostgreSQL job queue (FOR UPDATE SKIP LOCKED) with the real JobRunner loop.
 */
import type { AppConfig } from '../../src/config/app-config';
import type { JobHandler } from '../../src/shared/application/jobs';
import { PrismaJobQueue } from '../../src/shared/infrastructure/jobs/prisma-job.queue';
import type { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { JobRunner, type JobHandlers } from '../../src/worker/job-runner.service';
import { connect, resetDatabase } from '../support/integration-db';

let prisma: PrismaService;

beforeAll(async () => {
  ({ prisma } = await connect());
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma?.onModuleDestroy();
});

const config = { worker: { id: 'test-worker', pollIntervalMs: 50, leaseSeconds: 30, shutdownGraceMs: 2000, heartbeatFile: null } } as AppConfig;

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > timeoutMs) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function runner(handlers: Partial<JobHandlers>) {
  const noop: JobHandler = { handle: async () => undefined, onExhausted: async () => undefined };
  return new JobRunner(prisma, config, { PROCESS_IMPORT: noop, RUN_EXECUTION: noop, ...handlers }, { stopping: false });
}

describe('JobRunner', () => {
  it('processes queued jobs and marks them COMPLETED', async () => {
    const handled: unknown[] = [];
    const id = await new PrismaJobQueue(prisma).enqueue({ type: 'PROCESS_IMPORT', payload: { importId: '00000000-0000-4000-8000-000000000001' } });
    const worker = runner({ PROCESS_IMPORT: { handle: async (payload) => void handled.push(payload), onExhausted: async () => undefined } });
    worker.start();
    await waitFor(async () => (await prisma.backgroundJob.findUnique({ where: { id } }))?.status === 'COMPLETED');
    await worker.stop(1000);
    expect(handled).toEqual([{ importId: '00000000-0000-4000-8000-000000000001' }]);
  });

  it('retries with backoff and calls onExhausted after the last attempt', async () => {
    let exhausted = 0;
    const id = await new PrismaJobQueue(prisma).enqueue({ type: 'RUN_EXECUTION', payload: { executionId: '00000000-0000-4000-8000-000000000002' }, maxAttempts: 2 });
    const worker = runner({
      RUN_EXECUTION: {
        handle: async () => {
          throw new Error('falha');
        },
        onExhausted: async () => void (exhausted += 1),
      },
    });
    worker.start();
    await waitFor(async () => (await prisma.backgroundJob.findUnique({ where: { id } }))?.attempts === 1);
    // Skip the backoff delay of the first retry.
    await prisma.backgroundJob.update({ where: { id }, data: { runAfter: new Date() } });
    await waitFor(async () => (await prisma.backgroundJob.findUnique({ where: { id } }))?.status === 'FAILED');
    await worker.stop(1000);
    const job = await prisma.backgroundJob.findUnique({ where: { id } });
    expect(job).toEqual(expect.objectContaining({ attempts: 2, lastError: expect.stringContaining('falha') }));
    expect(exhausted).toBe(1);
  });

  it('fences the final update: a worker that lost its lease does not overwrite the new owner', async () => {
    const id = await new PrismaJobQueue(prisma).enqueue({ type: 'PROCESS_IMPORT', payload: { importId: '00000000-0000-4000-8000-000000000003' } });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const worker = runner({ PROCESS_IMPORT: { handle: () => gate, onExhausted: async () => undefined } });
    worker.start();
    await waitFor(async () => (await prisma.backgroundJob.findUnique({ where: { id } }))?.status === 'RUNNING');
    // Another replica reclaimed the job after the lease expired.
    await prisma.backgroundJob.update({ where: { id }, data: { lockedBy: 'other-worker', heartbeatAt: new Date() } });
    release();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await worker.stop(1000);
    expect(await prisma.backgroundJob.findUnique({ where: { id } })).toEqual(expect.objectContaining({ status: 'RUNNING', lockedBy: 'other-worker' }));
  });
});
