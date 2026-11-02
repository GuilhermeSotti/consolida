import { Injectable } from '@nestjs/common';
import type { JobQueue, JobType, TransactionContext } from '../../application/ports';
import { db } from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

/** Enqueues background jobs in PostgreSQL, inside the caller's transaction when given. */
@Injectable()
export class PrismaJobQueue implements JobQueue {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(job: { type: JobType; payload: Record<string, string>; maxAttempts?: number }, tx?: TransactionContext): Promise<string> {
    const created = await db(this.prisma, tx).backgroundJob.create({
      data: { type: job.type, payload: job.payload, maxAttempts: job.maxAttempts ?? 3 },
      select: { id: true },
    });
    return created.id;
  }
}
