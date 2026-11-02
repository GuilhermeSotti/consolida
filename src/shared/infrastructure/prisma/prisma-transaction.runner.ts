import { Injectable } from '@nestjs/common';
import type { TransactionContext, TransactionOptions, TransactionRunner } from '../../application/ports';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (tx: TransactionContext) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    return this.prisma.$transaction((client) => work(client as unknown as TransactionContext), {
      maxWait: 10_000,
      timeout: options.timeoutMs ?? 30_000,
    });
  }
}
