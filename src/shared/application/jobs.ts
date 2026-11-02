/**
 * Thrown by a job handler when it stopped because the worker is shutting down.
 * The job runner releases the job for another attempt without counting it as a failure.
 */
export class JobInterruptedError extends Error {
  constructor(message = 'Job interrupted by worker shutdown.') {
    super(message);
    this.name = 'JobInterruptedError';
  }
}

export interface JobHandler {
  /** Processes the job payload; throwing schedules a retry (with backoff) while attempts remain. */
  handle(payload: Record<string, unknown>): Promise<void>;
  /** Invoked once when the last attempt failed, so the business entity can be marked as failed. */
  onExhausted(payload: Record<string, unknown>, error: unknown): Promise<void>;
}
