import { Module } from '@nestjs/common';
import { RunExecutionUseCase } from './application/use-cases/run-execution.use-case';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { ExecutionsController } from './presentation/executions.controller';
import { RulesModule } from '../rules/rules.module';
import { LoadersModule } from '../loaders/loaders.module';

@Module({
  imports: [RulesModule, LoadersModule],
  controllers: [ExecutionsController],
  providers: [RunExecutionUseCase, PrismaService],
  exports: [RunExecutionUseCase],
})
export class ExecutionsModule {}
