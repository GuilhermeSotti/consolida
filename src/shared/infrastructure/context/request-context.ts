import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Per-request (or per-job) context propagated with AsyncLocalStorage. It feeds structured logs
 * and audit records (request id, client address, authenticated user) without threading these
 * values through every call.
 */
export interface RequestContextStore {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export const RequestContext = {
  run<T>(store: RequestContextStore, work: () => T): T {
    return storage.run(store, work);
  },
  current(): RequestContextStore | undefined {
    return storage.getStore();
  },
  setUser(userId: string): void {
    const store = storage.getStore();
    if (store) store.userId = userId;
  },
};

/** Accepts a caller-supplied correlation id only when it is short and harmless; otherwise generates one. */
export function resolveRequestId(header: unknown): string {
  return typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
}
