import { LoggerService } from '@nestjs/common';
import type { LogLevel } from '../../../config/app-config';
import { RequestContext } from '../context/request-context';
import { redact } from './redact';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured JSON logger (one line per event) used by Nest and by the application.
 * Every line carries the request/job correlation id and the local user id when available;
 * e-mails, tokens and payloads are redacted.
 */
export class JsonLogger implements LoggerService {
  constructor(
    private readonly minimum: LogLevel = 'info',
    private readonly write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  ) {}

  log(message: unknown, ...params: unknown[]): void {
    this.emit('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.emit('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.emit('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.emit('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.emit('debug', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.emit('error', message, params);
  }

  private emit(level: LogLevel, message: unknown, params: unknown[]): void {
    if (LEVELS[level] < LEVELS[this.minimum]) return;
    const rest = [...params];
    // Nest passes the context as the last string argument and, for errors, the stack before it.
    const context = rest.length > 0 && typeof rest[rest.length - 1] === 'string' ? (rest.pop() as string) : undefined;
    const stack = level === 'error' && typeof rest[0] === 'string' && rest[0].includes('\n    at ') ? (rest.shift() as string) : undefined;
    const store = RequestContext.current();
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      context,
      requestId: store?.requestId,
      userId: store?.userId,
    };
    if (message instanceof Error) {
      entry.msg = message.message;
      entry.error = { name: message.name, stack: message.stack };
    } else if (typeof message === 'object' && message !== null) {
      Object.assign(entry, redact(message) as Record<string, unknown>);
    } else {
      entry.msg = String(message);
    }
    if (stack) entry.stack = stack;
    if (rest.length > 0) entry.extra = redact(rest);
    try {
      this.write(JSON.stringify(entry));
    } catch {
      this.write(JSON.stringify({ time: entry.time, level, msg: 'log serialization failed' }));
    }
  }
}
