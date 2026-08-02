import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';
type LogContext = string | Record<string, unknown> | undefined;

@Injectable()
export class StructuredLoggerService implements LoggerService {
  constructor(private readonly context: RequestContextService) {}

  private normalizeContext(context?: LogContext): Record<string, unknown> {
    if (typeof context === 'string') {
      return { context };
    }

    if (context && typeof context === 'object' && !Array.isArray(context)) {
      return context as Record<string, unknown>;
    }

    return {};
  }

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

  log(message: any, context?: LogContext) {
    this.write('log', message, this.normalizeContext(context));
  }

  error(message: any, trace?: string, context?: LogContext) {
    this.write('error', message, {
      ...this.normalizeContext(context),
      trace,
    });
  }

  warn(message: any, context?: LogContext) {
    this.write('warn', message, this.normalizeContext(context));
  }

  debug(message: any, context?: LogContext) {
    this.write('debug', message, this.normalizeContext(context));
  }

  verbose(message: any, context?: LogContext) {
    this.write('verbose', message, this.normalizeContext(context));
  }
}
