import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, LoggerService } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { DomainError, ErrorDetail } from '../../domain/errors';
import { RequestContext } from '../../infrastructure/context/request-context';
import { ApiFailure } from './api-response';

const STATUS_BY_KIND: Record<DomainError['kind'], number> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  UNPROCESSABLE: HttpStatus.UNPROCESSABLE_ENTITY,
};

const CODE_BY_STATUS: Record<number, [string, string]> = {
  400: ['BAD_REQUEST', 'Requisição inválida.'],
  401: ['UNAUTHENTICATED', 'Autenticação necessária.'],
  403: ['FORBIDDEN', 'Acesso negado.'],
  404: ['NOT_FOUND', 'Recurso não encontrado.'],
  405: ['METHOD_NOT_ALLOWED', 'Método não permitido.'],
  406: ['NOT_ACCEPTABLE', 'Formato de resposta não suportado.'],
  409: ['CONFLICT', 'Conflito com o estado atual do recurso.'],
  413: ['PAYLOAD_TOO_LARGE', 'Conteúdo maior que o limite permitido.'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Tipo de conteúdo não suportado.'],
  422: ['UNPROCESSABLE', 'Não foi possível processar a requisição.'],
  429: ['RATE_LIMITED', 'Muitas requisições. Tente novamente em instantes.'],
};

interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
}

function httpErrorStatus(error: unknown): number | undefined {
  // Errors raised by Express middleware (body-parser, etc.) follow the http-errors convention.
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown; expose?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 && candidate.expose === true ? status : undefined;
}

export function mapException(exception: unknown): MappedError {
  if (exception instanceof DomainError) {
    return {
      status: STATUS_BY_KIND[exception.kind],
      code: exception.code,
      message: exception.message,
      details: exception.details.length > 0 ? exception.details : undefined,
    };
  }
  if (exception instanceof ThrottlerException) {
    return { status: 429, code: CODE_BY_STATUS[429][0], message: CODE_BY_STATUS[429][1] };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 503) return { status, code: 'SERVICE_UNAVAILABLE', message: 'Serviço temporariamente indisponível.' };
    if (status >= 500) return { status, code: 'INTERNAL_ERROR', message: 'Erro interno.' };
    const [code, fallback] = CODE_BY_STATUS[status] ?? ['HTTP_ERROR', 'Requisição não atendida.'];
    const response = exception.getResponse();
    let message = fallback;
    if (typeof response === 'string') message = response;
    else if (typeof response === 'object' && response !== null) {
      const raw = (response as { message?: unknown }).message;
      if (typeof raw === 'string') message = raw;
      else if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) message = raw.join('; ');
    }
    if (status === 404 && message.startsWith('Cannot ')) return { status, code: 'ROUTE_NOT_FOUND', message: 'Rota não encontrada.' };
    return { status, code, message: message.slice(0, 500) };
  }
  const status = httpErrorStatus(exception);
  if (status !== undefined) {
    const [code, message] = CODE_BY_STATUS[status] ?? ['HTTP_ERROR', 'Requisição não atendida.'];
    return { status, code, message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Erro interno. Informe o requestId ao suporte.' };
}

/**
 * Converts every error into the failure envelope. Internal details (stack traces, SQL, Prisma
 * messages) are logged with the request id and never returned to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const mapped = mapException(exception);
    const requestId = RequestContext.current()?.requestId ?? 'unknown';

    const logEntry = {
      event: 'request_failed',
      method: request?.method,
      path: request?.path,
      status: mapped.status,
      code: mapped.code,
    };
    if (mapped.status >= 500) {
      this.logger.error({ ...logEntry, error: exception instanceof Error ? { name: exception.name, message: exception.message, stack: exception.stack } : String(exception) }, 'ApiExceptionFilter');
    } else if (mapped.status === 401 || mapped.status === 403) {
      this.logger.warn(logEntry, 'ApiExceptionFilter');
    } else {
      this.logger.debug?.(logEntry, 'ApiExceptionFilter');
    }

    if (response.headersSent) {
      response.end();
      return;
    }
    if (mapped.status === 401) {
      response.setHeader('WWW-Authenticate', mapped.code === 'MISSING_TOKEN' ? 'Bearer realm="consolidahub"' : 'Bearer realm="consolidahub", error="invalid_token"');
    }
    const body: ApiFailure = {
      success: false,
      error: { code: mapped.code, message: mapped.message, details: mapped.details, requestId },
    };
    response.status(mapped.status).json(body);
  }
}
