import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap, catchError } from 'rxjs';
import { StructuredLoggerService } from './structured-logger.service';
import { RequestContextService } from './request-context.service';
import { throwError } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly context: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap((_response) => {
        const ctx = this.context.get();
        this.logger.log('request_completed', JSON.stringify({
          status: 'success',
          durationMs: Date.now() - start,
          path: req.originalUrl,
          method: req.method,
          statusCode: context.switchToHttp().getResponse().statusCode,
          userId: ctx?.userId,
        }));
      }),
      catchError((error) => {
        const ctx = this.context.get();
        this.logger.error('request_failed', error?.stack, JSON.stringify({
          status: 'error',
          durationMs: Date.now() - start,
          path: req.originalUrl,
          method: req.method,
          userId: ctx?.userId,
          errorMessage: error?.message,
        }));
        return throwError(() => error);
      }),
    );
  }
}
