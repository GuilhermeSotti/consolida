import { Module } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import {
  TOKENS,
  type AuditRecorder,
  type Clock,
  type JobQueue,
  type NotificationPublisher,
  type TransactionRunner,
} from '../../shared/application/ports';
import { RULES_REPOSITORY, type RulesRepository } from '../rules/application/ports';
import { RulesCoreModule } from '../rules/rules.module';
import { SOURCES_TOKENS, type SourcesRepository } from '../sources/application/ports';
import { SourcesCoreModule } from '../sources/sources.module';
import { ExecutionRunner } from './application/execution-runner';
import { ExecutionsService } from './application/executions.service';
import {
  EXECUTIONS_TOKENS,
  type ExecutionDataStore,
  type ExecutionLimits,
  type ExecutionsRepository,
} from './application/ports';
import { PrismaExecutionDataStore } from './infrastructure/prisma-execution-data.store';
import { PrismaExecutionsRepository } from './infrastructure/prisma-executions.repository';
import { ExecutionsController } from './presentation/executions.controller';

@Module({
  imports: [SourcesCoreModule, RulesCoreModule],
  providers: [
    { provide: EXECUTIONS_TOKENS.EXECUTIONS_REPOSITORY, useClass: PrismaExecutionsRepository },
    { provide: EXECUTIONS_TOKENS.EXECUTION_DATA_STORE, useClass: PrismaExecutionDataStore },
    { provide: EXECUTIONS_TOKENS.EXECUTION_LIMITS, useFactory: (config: AppConfig): ExecutionLimits => config.executions, inject: [TOKENS.APP_CONFIG] },
    {
      provide: ExecutionsService,
      useFactory: (
        executions: ExecutionsRepository,
        data: ExecutionDataStore,
        rules: RulesRepository,
        sources: SourcesRepository,
        transactions: TransactionRunner,
        jobs: JobQueue,
        audit: AuditRecorder,
      ) => new ExecutionsService(executions, data, rules, sources, transactions, jobs, audit),
      inject: [
        EXECUTIONS_TOKENS.EXECUTIONS_REPOSITORY,
        EXECUTIONS_TOKENS.EXECUTION_DATA_STORE,
        RULES_REPOSITORY,
        SOURCES_TOKENS.SOURCES_REPOSITORY,
        TOKENS.TRANSACTION_RUNNER,
        TOKENS.JOB_QUEUE,
        TOKENS.AUDIT_RECORDER,
      ],
    },
    {
      provide: ExecutionRunner,
      useFactory: (
        executions: ExecutionsRepository,
        data: ExecutionDataStore,
        rules: RulesRepository,
        sources: SourcesRepository,
        transactions: TransactionRunner,
        audit: AuditRecorder,
        notifications: NotificationPublisher,
        clock: Clock,
        limits: ExecutionLimits,
      ) => new ExecutionRunner(executions, data, rules, sources, transactions, audit, notifications, clock, limits),
      inject: [
        EXECUTIONS_TOKENS.EXECUTIONS_REPOSITORY,
        EXECUTIONS_TOKENS.EXECUTION_DATA_STORE,
        RULES_REPOSITORY,
        SOURCES_TOKENS.SOURCES_REPOSITORY,
        TOKENS.TRANSACTION_RUNNER,
        TOKENS.AUDIT_RECORDER,
        TOKENS.NOTIFICATION_PUBLISHER,
        TOKENS.CLOCK,
        EXECUTIONS_TOKENS.EXECUTION_LIMITS,
      ],
    },
  ],
  exports: [ExecutionsService, ExecutionRunner],
})
export class ExecutionsCoreModule {}

@Module({
  imports: [ExecutionsCoreModule],
  controllers: [ExecutionsController],
})
export class ExecutionsModule {}
