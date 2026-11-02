import type { ErrorDetail } from '../../domain/errors';
import { Page, totalPages } from '../../domain/pagination';

/** Response envelope (see contracts/openapi.yaml#/components/schemas). */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  metadata?: PageMetadata;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: ErrorDetail[]; requestId: string };
}

export interface PageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Returned by controllers for list endpoints; the interceptor moves paging info to `metadata`. */
export class PaginatedResult<T> {
  constructor(readonly page: Page<T>) {}

  static of<S, T>(page: Page<S>, map: (item: S) => T): PaginatedResult<T> {
    return new PaginatedResult({ ...page, items: page.items.map(map) });
  }

  toEnvelope(): ApiSuccess<T[]> {
    return {
      success: true,
      data: this.page.items,
      metadata: {
        page: this.page.page,
        pageSize: this.page.pageSize,
        totalItems: this.page.totalItems,
        totalPages: totalPages(this.page),
      },
    };
  }
}
