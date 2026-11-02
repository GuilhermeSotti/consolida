import { Module } from '@nestjs/common';
import { TOKENS, type AuditRecorder, type TransactionRunner } from '../../shared/application/ports';
import { SOURCES_TOKENS, type SourcesRepository } from '../sources/application/ports';
import { SourcesCoreModule } from '../sources/sources.module';
import { RULES_REPOSITORY, type RulesRepository } from './application/ports';
import { RulesService } from './application/rules.service';
import { PrismaRulesRepository } from './infrastructure/prisma-rules.repository';
import { RulesController } from './presentation/rules.controller';

@Module({
  imports: [SourcesCoreModule],
  providers: [
    { provide: RULES_REPOSITORY, useClass: PrismaRulesRepository },
    {
      provide: RulesService,
      useFactory: (rules: RulesRepository, sources: SourcesRepository, transactions: TransactionRunner, audit: AuditRecorder) =>
        new RulesService(rules, sources, transactions, audit),
      inject: [RULES_REPOSITORY, SOURCES_TOKENS.SOURCES_REPOSITORY, TOKENS.TRANSACTION_RUNNER, TOKENS.AUDIT_RECORDER],
    },
  ],
  exports: [RULES_REPOSITORY, RulesService],
})
export class RulesCoreModule {}

@Module({
  imports: [RulesCoreModule],
  controllers: [RulesController],
})
export class RulesModule {}
