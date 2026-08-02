import { Module } from '@nestjs/common';

import { RulesController } from './presentation/rules.controller';

import { CreateRuleUseCase } from './application/use-cases/create-rule.use-case';
import { UpdateRuleUseCase } from './application/use-cases/update-rule.use-case';
import { ListRulesUseCase } from './application/use-cases/list-rules.use-case';
import { GetRuleUseCase } from './application/use-cases/get-rule.use-case';
import { DeactivateRuleUseCase } from './application/use-cases/deactivate-rule.use-case';
import { GetRuleVersionsUseCase } from './application/use-cases/get-rule-versions.use-case';
import { ActivateRuleUseCase } from './application/use-cases/activate-rule.use-case';

import { RulesRepository } from './domain/repositories/rules.repository';

import { PrismaRulesRepository } from './infrastructure/persistence/prisma-rules.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { RuleApplierService } from './application/services/rule-applier.service';

@Module({
  controllers: [RulesController],

  providers: [
    CreateRuleUseCase,
    UpdateRuleUseCase,
    ListRulesUseCase,
    GetRuleUseCase,
    DeactivateRuleUseCase,
    GetRuleVersionsUseCase,
    ActivateRuleUseCase,
    RuleApplierService,

    {
      provide: RulesRepository,
      useClass: PrismaRulesRepository,
    },

    PrismaService,
  ],

  exports: [RulesRepository, RuleApplierService],
})
export class RulesModule {}
