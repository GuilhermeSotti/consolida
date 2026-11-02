import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext, resolveRequestId } from '../../infrastructure/context/request-context';

/**
 * First middleware of the chain: assigns the correlation id (echoed in `X-Request-Id`), opens
 * the AsyncLocalStorage context and logs one structured line per request (no query string,
 * no headers, no body).
 */
export function requestContextMiddleware(logger: LoggerService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    const started = process.hrtime.bigint();
    response.setHeader('X-Request-Id', requestId);
    const store = {
      requestId,
      ipAddress: request.ip,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    };
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      RequestContext.run(store, () =>
        logger.log(
          {
            event: 'http_request',
            method: request.method,
            route: (request.route as { path?: string } | undefined)?.path ?? request.path,
            status: response.statusCode,
            durationMs: Math.round(durationMs * 10) / 10,
          },
          'HTTP',
        ),
      );
    });
    RequestContext.run(store, () => next());
  };
}
