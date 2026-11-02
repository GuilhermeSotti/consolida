/**
 * Domain/application errors. They carry a stable machine-readable `code` and are mapped to
 * HTTP responses by the presentation layer (AllExceptionsFilter). They never include secrets
 * or raw infrastructure messages.
 */
export interface ErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export abstract class DomainError extends Error {
  abstract readonly kind:
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'VALIDATION'
    | 'FORBIDDEN'
    | 'UNPROCESSABLE'
    | 'UNAUTHENTICATED';

  protected constructor(
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly kind = 'NOT_FOUND' as const;
  constructor(entity: string, id?: string) {
    super(`${entity.toUpperCase()}_NOT_FOUND`, id ? `${entity} ${id} não encontrado(a).` : `${entity} não encontrado(a).`);
  }
}

export class ConflictError extends DomainError {
  readonly kind = 'CONFLICT' as const;
  constructor(code: string, message: string, details: ErrorDetail[] = []) {
    super(code, message, details);
  }
}

export class ValidationError extends DomainError {
  readonly kind = 'VALIDATION' as const;
  constructor(message: string, details: ErrorDetail[] = [], code = 'VALIDATION_FAILED') {
    super(code, message, details);
  }
}

export class ForbiddenError extends DomainError {
  readonly kind = 'FORBIDDEN' as const;
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class UnprocessableError extends DomainError {
  readonly kind = 'UNPROCESSABLE' as const;
  constructor(code: string, message: string, details: ErrorDetail[] = []) {
    super(code, message, details);
  }
}

export class UnauthenticatedError extends DomainError {
  readonly kind = 'UNAUTHENTICATED' as const;
  constructor(code: string, message = 'Autenticação necessária.') {
    super(code, message);
  }
}
