import { Inject, Injectable, Logger } from '@nestjs/common';
import { utimes, writeFile } from 'node:fs/promises';
import type { AppConfig } from '../config/app-config';
import { JobHandler, JobInterruptedError } from '../shared/application/jobs';
import { TOKENS, type JobType } from '../shared/application/ports';
import { RequestContext } from '../shared/infrastructure/context/request-context';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { leaseHeartbeatIntervalMs, livenessThresholdMs, WorkerLiveness } from './worker-health';

interface ClaimedJob {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

export const JOB_HANDLERS = 'JobHandlers';
export type JobHandlers = Record<JobType, JobHandler>;

/** Shared flag read by long-running handlers to stop at a safe point during shutdown. */
export interface WorkerState {
  stopping: boolean;
}
export const WORKER_STATE = 'WorkerState';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

/**
 * PostgreSQL-backed job consumer. Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so several
 * worker replicas can run safely. A job whose heartbeat stops (crashed worker) is reclaimed
 * after the lease; failures are retried with exponential backoff up to `max_attempts`.
 * Progress (each polling cycle and each lease heartbeat of the running job) feeds the worker
 * liveness signal: heartbeat file and optional HTTP probe.
 */
@Injectable()
export class JobRunner {
  private readonly logger = new Logger('JobRunner');
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  readonly liveness: WorkerLiveness;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TOKENS.APP_CONFIG) private readonly config: AppConfig,
    @Inject(JOB_HANDLERS) private readonly handlers: JobHandlers,
    @Inject(WORKER_STATE) private readonly state: WorkerState,
  ) {
    this.liveness = new WorkerLiveness(livenessThresholdMs(config.worker.leaseSeconds, config.worker.pollIntervalMs));
  }

  start(): void {
    if (this.loop) return;
    this.logger.log({ event: 'worker_started', workerId: this.config.worker.id });
    this.loop = this.run();
  }

  /** Stops claiming new jobs and waits for the current one (bounded by the grace period). */
  async stop(graceMs: number): Promise<void> {
    this.state.stopping = true;
    this.wake?.();
    if (this.loop) await Promise.race([this.loop, sleep(graceMs)]);
    this.logger.log({ event: 'worker_stopped', workerId: this.config.worker.id });
  }

  private async run(): Promise<void> {
    while (!this.state.stopping) {
      await this.markProgress();
      let job: ClaimedJob | null = null;
      try {
        job = await this.claim();
      } catch (error) {
        this.logger.error({ event: 'job_claim_failed', error: error instanceof Error ? error.message : String(error) });
      }
      if (job) {
        await this.execute(job);
        continue;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        setTimeout(resolve, this.config.worker.pollIntervalMs).unref();
      });
      this.wake = null;
    }
  }

  private async claim(): Promise<ClaimedJob | null> {
    const rows = await this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE background_jobs
         SET status = 'RUNNING', locked_by = ${this.config.worker.id}, locked_at = now(), heartbeat_at = now(),
             attempts = attempts + 1, updated_at = now()
       WHERE id = (
             SELECT id FROM background_jobs
              WHERE (status = 'PENDING' AND run_after <= now())
                 OR (status = 'RUNNING' AND heartbeat_at < now() - (${this.config.worker.leaseSeconds}::int * interval '1 second'))
              ORDER BY run_after, created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1)
      RETURNING id, type::text AS type, payload, attempts, max_attempts`;
    return rows[0] ?? null;
  }

  private async execute(job: ClaimedJob): Promise<void> {
    const handler = this.handlers[job.type];
    const payload = typeof job.payload === 'object' && job.payload !== null ? (job.payload as Record<string, unknown>) : {};
    const log = { jobId: job.id, type: job.type, attempt: job.attempts };
    if (!handler) {
      await this.finish(job, 'FAILED', `Tipo de job desconhecido: ${job.type}`);
      return;
    }
    if (job.attempts > job.max_attempts) {
      // Reclaimed after a crash with no attempts left.
      await this.exhaust(job, handler, payload, new Error('Lease expired after the last attempt.'));
      return;
    }
    const heartbeat = setInterval(() => {
      void this.prisma.backgroundJob
        .updateMany({ where: { id: job.id, lockedBy: this.config.worker.id, status: 'RUNNING' }, data: { heartbeatAt: new Date() } })
        .then((result) => {
          // The worker is alive either way; a zero count means the lease expired and another
          // replica reclaimed the job: this run's final update will be fenced off.
          if (result.count === 0) this.logger.warn({ event: 'job_lease_lost', ...log });
          return this.markProgress();
        })
        .catch((error: unknown) => this.logger.warn({ event: 'job_heartbeat_failed', ...log, error: String(error) }));
    }, leaseHeartbeatIntervalMs(this.config.worker.leaseSeconds));
    heartbeat.unref();
    const started = Date.now();
    try {
      await RequestContext.run({ requestId: `job:${job.id}` }, () => handler.handle(payload));
      if (await this.finish(job, 'COMPLETED')) {
        this.logger.log({ event: 'job_completed', ...log, durationMs: Date.now() - started });
      } else {
        this.logger.warn({ event: 'job_completed_after_lease_lost', ...log, durationMs: Date.now() - started });
      }
    } catch (error) {
      if (error instanceof JobInterruptedError) {
        await this.prisma.backgroundJob.updateMany({
          where: { id: job.id, lockedBy: this.config.worker.id },
          data: { status: 'PENDING', attempts: { decrement: 1 }, lockedBy: null, lockedAt: null, heartbeatAt: null, runAfter: new Date() },
        });
        this.logger.warn({ event: 'job_interrupted', ...log });
      } else if (job.attempts < job.max_attempts) {
        const delayMs = Math.min(5 * 60_000, 5_000 * 2 ** (job.attempts - 1));
        await this.prisma.backgroundJob.updateMany({
          where: { id: job.id, lockedBy: this.config.worker.id },
          data: { status: 'PENDING', lockedBy: null, lockedAt: null, heartbeatAt: null, runAfter: new Date(Date.now() + delayMs), lastError: describe(error) },
        });
        this.logger.error({ event: 'job_failed_will_retry', ...log, retryInMs: delayMs, error: describe(error), stack: error instanceof Error ? error.stack : undefined });
      } else {
        await this.exhaust(job, handler, payload, error);
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async exhaust(job: ClaimedJob, handler: JobHandler, payload: Record<string, unknown>, error: unknown): Promise<void> {
    if (!(await this.finish(job, 'FAILED', describe(error)))) {
      // Another replica owns the job now; its outcome prevails.
      this.logger.warn({ event: 'job_exhausted_after_lease_lost', jobId: job.id, type: job.type, attempts: job.attempts });
      return;
    }
    this.logger.error({ event: 'job_exhausted', jobId: job.id, type: job.type, attempts: job.attempts, error: describe(error) });
    try {
      await RequestContext.run({ requestId: `job:${job.id}` }, () => handler.onExhausted(payload, error));
    } catch (hookError) {
      this.logger.error({ event: 'job_exhausted_hook_failed', jobId: job.id, error: describe(hookError) });
    }
  }

  /** Final state, fenced by the lease: false when another worker reclaimed the job meanwhile. */
  private async finish(job: ClaimedJob, status: 'COMPLETED' | 'FAILED', lastError?: string): Promise<boolean> {
    const result = await this.prisma.backgroundJob.updateMany({
      where: { id: job.id, lockedBy: this.config.worker.id, status: 'RUNNING' },
      data: { status, lockedBy: null, lockedAt: null, heartbeatAt: null, completedAt: new Date(), lastError: lastError ?? null },
    });
    return result.count > 0;
  }

  private async markProgress(): Promise<void> {
    this.liveness.markProgress();
    await this.touchHeartbeatFile();
  }

  private async touchHeartbeatFile(): Promise<void> {
    const file = this.config.worker.heartbeatFile;
    if (!file) return;
    const now = new Date();
    try {
      await utimes(file, now, now);
    } catch {
      await writeFile(file, now.toISOString()).catch(() => undefined);
    }
  }
}

function describe(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 1000);
}
