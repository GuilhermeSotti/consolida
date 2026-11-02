import type { Prisma } from '@prisma/client';
import type { PageRequest } from '../../domain/pagination';
import type { Row } from '../../domain/tabular';

/** Rows are persisted as JSON arrays of this many rows (import_chunks / report_chunks). */
export const ROW_CHUNK_SIZE = 1000;
/** Chunks inserted per statement (keeps statements well below PostgreSQL limits). */
export const CHUNK_INSERT_BATCH = 20;

export function splitIntoChunks<T>(rows: readonly T[], size = ROW_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) chunks.push(rows.slice(start, start + size));
  return chunks;
}

/** Chunk interval covering a page of rows. */
export function chunkRangeForPage(page: PageRequest, size = ROW_CHUNK_SIZE): { first: number; last: number; offset: number } {
  const start = (page.page - 1) * page.pageSize;
  const end = start + page.pageSize - 1;
  const first = Math.floor(start / size);
  return { first, last: Math.floor(end / size), offset: start - first * size };
}

/** Rows stored by this application; the shape is checked defensively. */
export function asRows(value: Prisma.JsonValue): Row[] {
  if (!Array.isArray(value)) throw new Error('Corrupted row chunk: expected a JSON array.');
  return value as unknown as Row[];
}
