export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePageRequest(page?: number, pageSize?: number): PageRequest {
  const safePage = Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
  const requested = Number.isInteger(pageSize) && (pageSize as number) > 0 ? (pageSize as number) : DEFAULT_PAGE_SIZE;
  return { page: safePage, pageSize: Math.min(requested, MAX_PAGE_SIZE) };
}

export function toSkipTake(request: PageRequest): { skip: number; take: number } {
  return { skip: (request.page - 1) * request.pageSize, take: request.pageSize };
}

export function totalPages(page: Pick<Page<unknown>, 'totalItems' | 'pageSize'>): number {
  return page.totalItems === 0 ? 0 : Math.ceil(page.totalItems / page.pageSize);
}
