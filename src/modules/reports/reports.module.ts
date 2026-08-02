import { Module } from '@nestjs/common';

import { ReportsController } from './presentation/reports.controller';
import { GetReportUseCase } from './application/use-cases/get-report.use-case';
import { ListReportsUseCase } from './application/use-cases/list-reports.use-case';
import { ReportsRepository } from './domain/repositories/reports.repository';
import { PrismaReportsRepository } from './infrastructure/persistence/prisma-reports.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

@Module({
  controllers: [ReportsController],
  providers: [
    GetReportUseCase,
    ListReportsUseCase,
    {
      provide: ReportsRepository,
      useClass: PrismaReportsRepository,
    },
    PrismaService,
  ],
  exports: [ReportsRepository],
})
export class ReportsModule {}
