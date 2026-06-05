import { Injectable } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TelemetryService {
  private readonly tracer = trace.getTracer('consolidahub-api');

  async withSpan<T>(
    name: string,
    attributes: Record<string, unknown> = {},
    fn: () => Promise<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const span = this.tracer.startSpan(name, { attributes });

      span.addEvent('span_started');

      Promise.resolve()
        .then(() => fn())
        .then((result) => {
          span.setStatus({ code: SpanStatusCode.OK });
          span.addEvent('span_completed');
          span.end();
          resolve(result);
        })
        .catch((error) => {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message:
              error instanceof Error ? error.message : 'Unknown error',
          });
          span.addEvent('span_error');
          span.end();
          reject(error);
        });
    });
  }
}
