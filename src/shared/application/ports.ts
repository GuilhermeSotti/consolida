/**
 * Ports shared by the application layer. Implementations live in infrastructure (Prisma,
 * request context, etc.); application services depend only on these interfaces so they can be
 * unit-tested without NestJS or a database.
 */

/** Opaque handle of an open database transaction. */
export interface TransactionContext {
  readonly __brand: 'TransactionContext';
}

export interface TransactionOptions {
  /** Upper bound for the whole transaction (default 30 s). */
  timeoutMs?: number;
}

export interface TransactionRunner {
  run<T>(work: (tx: TransactionContext) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: AuditOutcome;
  /** Defaults to the authenticated user of the current request, when any. */
  actorUserId?: string | null;
  /** Business details only — never secrets, tokens or file contents. */
  details?: Record<string, unknown>;
}

export interface AuditRecorder {
  record(entry: AuditEntry, tx?: TransactionContext): Promise<void>;
}

export type NotificationType = 'IMPORT_VALIDATED' | 'IMPORT_REJECTED' | 'EXECUTION_SUCCEEDED' | 'EXECUTION_FAILED';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface NotificationPublisher {
  notify(input: NotificationInput, tx?: TransactionContext): Promise<void>;
}

export type JobType = 'PROCESS_IMPORT' | 'RUN_EXECUTION';

export interface JobQueue {
  enqueue(job: { type: JobType; payload: Record<string, string>; maxAttempts?: number }, tx?: TransactionContext): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** DI tokens (plain strings keep the application layer free of framework imports). */
export const TOKENS = {
  TRANSACTION_RUNNER: 'TransactionRunner',
  AUDIT_RECORDER: 'AuditRecorder',
  NOTIFICATION_PUBLISHER: 'NotificationPublisher',
  JOB_QUEUE: 'JobQueue',
  CLOCK: 'Clock',
  APP_CONFIG: 'AppConfig',
} as const;
