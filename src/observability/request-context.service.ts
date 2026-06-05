import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextData = {
  requestId: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
};

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContextData>();

  run<T>(context: RequestContextData, fn: () => T): T {
    return this.als.run(context, fn);
  }

  get(): RequestContextData | undefined {
    return this.als.getStore();
  }

  merge(partial: Partial<RequestContextData>) {
    const current = this.get();
    if (!current) return;
    Object.assign(current, partial);
  }
}
