import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ApiSuccess, PaginatedResult } from './api-response';

/** Wraps every JSON response as `{ success: true, data, metadata? }`. File downloads pass through. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value instanceof StreamableFile) return value;
        if (value instanceof PaginatedResult) return value.toEnvelope();
        const envelope: ApiSuccess<unknown> = { success: true, data: value ?? null };
        return envelope;
      }),
    );
  }
}
