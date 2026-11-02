import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../../config/app-config';
import { TOKENS } from '../../application/ports';

/**
 * Single Prisma client per process (shared by every module through the core module).
 *
 * In production the API and the worker refuse to start when DATABASE_URL authenticates as the
 * owner of the schema tables (or a member of that role): that is the migration/DDL credential,
 * and the application must use the least-privilege role (infra/database/app-role.sql).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly enforceLeastPrivilege: boolean;

  constructor(@Inject(TOKENS.APP_CONFIG) config: AppConfig) {
    super({
      datasourceUrl: config.databaseUrl,
      errorFormat: 'minimal',
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    });
    this.enforceLeastPrivilege = config.nodeEnv === 'production';
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (this.enforceLeastPrivilege && (await this.connectedAsTableOwner())) {
      await this.$disconnect();
      throw new Error(
        'DATABASE_URL usa o papel dono das tabelas (credencial de migração). Em produção, API e worker devem usar o papel restrito criado por infra/database/app-role.sql.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  private async connectedAsTableOwner(): Promise<boolean> {
    const rows = await this.$queryRaw<Array<{ owns: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND pg_has_role(current_user, tableowner, 'MEMBER')
      ) AS owns`;
    return rows[0]?.owns === true;
  }
}
