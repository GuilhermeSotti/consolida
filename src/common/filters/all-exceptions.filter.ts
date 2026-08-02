import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    type ErrorDetails = { message: string };
    type HttpExceptionResponse =
      | string
      | {
          statusCode?: number;
          message?: string | string[];
          error?: { details?: ErrorDetails[] };
          code?: string;
        };

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Erro interno inesperado';
    let details: ErrorDetails[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as HttpExceptionResponse;

      message =
        typeof body === 'string'
          ? body
          : (Array.isArray(body.message) ? body.message[0] : body.message) ?? 
            exception.message ?? message;

      if (typeof body !== 'string') {
        code = body.code ?? this.getCodeFromStatus(status);

        if (body.error?.details) {
          details = body.error.details;
        }

        if (Array.isArray(body.message) && status === HttpStatus.BAD_REQUEST) {
          details = body.message.map((msg) => ({ message: msg }));
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error('Unhandled error:', exception);
      message = exception.message;
    } else {
      this.logger.error('Unknown error:', exception);
    }

    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        path: request.url,
        timestamp: new Date().toISOString(),
        ...(details.length > 0 && { details }),
      },
    };

    response.status(status).json(errorResponse);
  }

  private getCodeFromStatus(status: number): string {
    const codeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    };

    return codeMap[status] || 'INTERNAL_ERROR';
  }
}
