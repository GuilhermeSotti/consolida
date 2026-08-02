import { Module } from '@nestjs/common';

import { SourcesController } from './presentation/sources.controller';

import { CreateSourceUseCase } from './application/use-cases/create-source.use-case';
import { UpdateSourceUseCase } from './application/use-cases/update-source.use-case';
import { ListSourcesUseCase } from './application/use-cases/list-sources.use-case';
import { GetSourceUseCase } from './application/use-cases/get-source.use-case';
import { DeactivateSourceUseCase } from './application/use-cases/deactivate-source.use-case';

import { SourcesRepository } from './domain/repositories/sources.repository';

import { PrismaSourcesRepository } from './infrastructure/persistence/prisma-sources.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

@Module({
  controllers: [SourcesController],

  providers: [
    CreateSourceUseCase,
    UpdateSourceUseCase,
    ListSourcesUseCase,
    GetSourceUseCase,
    DeactivateSourceUseCase,

    {
      provide: SourcesRepository,
      useClass: PrismaSourcesRepository,
    },

    PrismaService,
  ],

  exports: [SourcesRepository],
})
export class SourcesModule {}
