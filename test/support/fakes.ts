import type {
  AuditEntry,
  AuditRecorder,
  Clock,
  JobQueue,
  JobType,
  NotificationInput,
  NotificationPublisher,
  TransactionContext,
  TransactionOptions,
  TransactionRunner,
} from '../../src/shared/application/ports';
import type { Principal } from '../../src/modules/auth/domain/access-control';
import { ROLE_DEFINITIONS } from '../../src/modules/auth/domain/access-control';

export const TX = { __brand: 'TransactionContext' } as TransactionContext;

/**
 * Runs the work immediately. When `failCommit` is set, the work runs and the "commit" fails,
 * which lets tests check that callers do not report success when a transaction is rolled back.
 */
export class FakeTransactions implements TransactionRunner {
  calls = 0;
  lastOptions: TransactionOptions | undefined;
  failCommit = false;

  async run<T>(work: (tx: TransactionContext) => Promise<T>, options?: TransactionOptions): Promise<T> {
    this.calls += 1;
    this.lastOptions = options;
    const result = await work(TX);
    if (this.failCommit) throw new Error('commit failed');
    return result;
  }
}

export class FakeAudit implements AuditRecorder {
  readonly entries: Array<AuditEntry & { inTransaction: boolean }> = [];

  async record(entry: AuditEntry, tx?: TransactionContext): Promise<void> {
    this.entries.push({ ...entry, inTransaction: tx === TX });
  }

  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }
}

export class FakeJobs implements JobQueue {
  readonly jobs: Array<{ type: JobType; payload: Record<string, string>; inTransaction: boolean }> = [];

  async enqueue(job: { type: JobType; payload: Record<string, string> }, tx?: TransactionContext): Promise<string> {
    this.jobs.push({ type: job.type, payload: job.payload, inTransaction: tx === TX });
    return `job-${this.jobs.length}`;
  }
}

export class FakeNotifications implements NotificationPublisher {
  readonly sent: Array<NotificationInput & { inTransaction: boolean }> = [];

  async notify(input: NotificationInput, tx?: TransactionContext): Promise<void> {
    this.sent.push({ ...input, inTransaction: tx === TX });
  }
}

export class FixedClock implements Clock {
  constructor(public current = new Date('2026-10-23T12:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function principal(roles: string[], userId = uuid(900)): Principal {
  const permissions = [...new Set(ROLE_DEFINITIONS.filter((role) => roles.includes(role.code)).flatMap((role) => role.permissions))];
  return { userId, displayName: 'Pessoa Teste', email: null, roles, permissions };
}

/** Captures the error thrown by an async call (fails the test when nothing is thrown). */
export async function failure(promise: Promise<unknown>): Promise<Error & { code?: string; details?: unknown[] }> {
  try {
    await promise;
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error('Expected the operation to fail, but it succeeded.');
}
