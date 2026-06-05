import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  constructor(private readonly context: RequestContextService) {}

  private write(
    level: LogLevel,
    message: unknown,
    meta: Record<string, unknown> = {},
  ) {
    const ctx = this.context.get();

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: ctx?.requestId,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      userId: ctx?.userId,
      email: ctx?.email,
      path: ctx?.path,
      method: ctx?.method,
      ...meta,
    };

    // stdout em JSON estruturado
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  log(message: any, context?: string) {
    this.write('log', message, { context });
  }

  error(message: any, trace?: string, context?: string) {
    this.write('error', message, { trace, context });
  }

  warn(message: any, context?: string) {
    this.write('warn', message, { context });
  }

  debug(message: any, context?: string) {
    this.write('debug', message, { context });
  }

  verbose(message: any, context?: string) {
    this.write('verbose', message, { context });
  }
}
