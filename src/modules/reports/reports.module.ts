import { Module } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import { TOKENS, type AuditRecorder } from '../../shared/application/ports';
import { REPORTS_TOKENS, type ReportsRepository, type SpreadsheetWriter } from './application/ports';
import { ReportsService } from './application/reports.service';
import { PrismaReportsRepository } from './infrastructure/prisma-reports.repository';
import { XlsxSpreadsheetWriter } from './infrastructure/xlsx-spreadsheet.writer';
import { ReportsController } from './presentation/reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [
    { provide: REPORTS_TOKENS.REPORTS_REPOSITORY, useClass: PrismaReportsRepository },
    { provide: REPORTS_TOKENS.SPREADSHEET_WRITER, useClass: XlsxSpreadsheetWriter },
    {
      provide: ReportsService,
      useFactory: (reports: ReportsRepository, writer: SpreadsheetWriter, audit: AuditRecorder, config: AppConfig) =>
        new ReportsService(reports, writer, audit, config.reports),
      inject: [REPORTS_TOKENS.REPORTS_REPOSITORY, REPORTS_TOKENS.SPREADSHEET_WRITER, TOKENS.AUDIT_RECORDER, TOKENS.APP_CONFIG],
    },
  ],
})
export class ReportsModule {}
