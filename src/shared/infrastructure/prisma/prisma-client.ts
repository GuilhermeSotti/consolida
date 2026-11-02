import { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../application/ports';
import type { PrismaService } from './prisma.service';

/** Returns the transactional client when the caller is inside a transaction, else the root client. */
export function db(prisma: PrismaService, tx?: TransactionContext): Prisma.TransactionClient {
  return tx ? (tx as unknown as Prisma.TransactionClient) : prisma;
}

/** Converts a plain value to Prisma JSON input; `undefined` leaves the column untouched. */
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Nullable JSON column: `null` is stored as SQL NULL (Prisma rejects a plain `null`). */
export function nullableJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null || value === undefined ? Prisma.DbNull : json(value);
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
