import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { StructuredLoggerService } from '../../../observability/structured-logger.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Optional() private readonly logger?: StructuredLoggerService,
  ) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    this.setupEventListeners();
  }

  private registerEventListener(eventName: string, callback: (event: any) => void): void {
    (this as unknown as {
      $on: (event: string, handler: (event: any) => void) => void;
    }).$on(eventName, callback);
  }

  private setupEventListeners(): void {
    this.registerEventListener('query', (e: any) => {
      if (this.logger) {
        this.logger.debug('prisma_query', {
          durationMs: e.duration,
          target: e.target,
          query: this.sanitizeQuery(e.query),
          params: this.sanitizeParams(e.params),
        });
      }
    });

    this.registerEventListener('info', (_e: any) => {
      if (this.logger) {
        this.logger.log('prisma_info', {
          context: 'PrismaService',
        });
      }
    });

    this.registerEventListener('warn', (e: any) => {
      if (this.logger) {
        this.logger.warn(e.message, {
          context: 'PrismaService',
        });
      }
    });

    this.registerEventListener('error', (e: any) => {
      if (this.logger) {
        this.logger.error(e.message, e.stack, {
          context: 'PrismaService',
        });
      }
    });
  }

  private sanitizeQuery(query: string): string {
    // Remove valores literais para evitar log de dados sensíveis
    return query
      .replace(/'[^']*'/g, "'***'")
      .replace(/"[^"]*"/g, '"***"');
  }

  private sanitizeParams(params: string): string {
    try {
      const parsed = JSON.parse(params);
      const sanitized = JSON.stringify(parsed).replace(
        /"value":"[^"]*"/g,
        '"value":"***"',
      );
      return sanitized;
    } catch {
      return '***';
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
