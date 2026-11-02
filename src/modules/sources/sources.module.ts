import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import type { AppConfig } from '../../config/app-config';
import { TOKENS, type AuditRecorder, type Clock, type JobQueue, type NotificationPublisher, type TransactionRunner } from '../../shared/application/ports';
import { ImportProcessor } from './application/import-processor';
import { ImportsService } from './application/imports.service';
import { SOURCES_TOKENS, type ImportLimits, type ImportsRepository, type SourcesRepository, type TabularFileReader } from './application/ports';
import { SourcesService } from './application/sources.service';
import { SpreadsheetFileReader } from './infrastructure/parsers/spreadsheet-file.reader';
import { PrismaImportsRepository } from './infrastructure/persistence/prisma-imports.repository';
import { PrismaSourcesRepository } from './infrastructure/persistence/prisma-sources.repository';
import { ImportsController, SourcesController } from './presentation/sources.controller';

const repositories = [
  { provide: SOURCES_TOKENS.SOURCES_REPOSITORY, useClass: PrismaSourcesRepository },
  { provide: SOURCES_TOKENS.IMPORTS_REPOSITORY, useClass: PrismaImportsRepository },
  { provide: SOURCES_TOKENS.TABULAR_FILE_READER, useClass: SpreadsheetFileReader },
  {
    provide: SOURCES_TOKENS.IMPORT_LIMITS,
    useFactory: (config: AppConfig): ImportLimits => config.imports,
    inject: [TOKENS.APP_CONFIG],
  },
];

const services = [
  {
    provide: SourcesService,
    useFactory: (sources: SourcesRepository, transactions: TransactionRunner, audit: AuditRecorder) => new SourcesService(sources, transactions, audit),
    inject: [SOURCES_TOKENS.SOURCES_REPOSITORY, TOKENS.TRANSACTION_RUNNER, TOKENS.AUDIT_RECORDER],
  },
  {
    provide: ImportsService,
    useFactory: (sources: SourcesRepository, imports: ImportsRepository, transactions: TransactionRunner, audit: AuditRecorder, jobs: JobQueue, limits: ImportLimits) =>
      new ImportsService(sources, imports, transactions, audit, jobs, limits),
    inject: [
      SOURCES_TOKENS.SOURCES_REPOSITORY,
      SOURCES_TOKENS.IMPORTS_REPOSITORY,
      TOKENS.TRANSACTION_RUNNER,
      TOKENS.AUDIT_RECORDER,
      TOKENS.JOB_QUEUE,
      SOURCES_TOKENS.IMPORT_LIMITS,
    ],
  },
];

/** Persistence and services shared by the HTTP API and the worker. */
@Module({
  providers: [
    ...repositories,
    ...services,
    {
      provide: ImportProcessor,
      useFactory: (
        sources: SourcesRepository,
        imports: ImportsRepository,
        reader: TabularFileReader,
        transactions: TransactionRunner,
        audit: AuditRecorder,
        notifications: NotificationPublisher,
        clock: Clock,
        limits: ImportLimits,
      ) => new ImportProcessor(sources, imports, reader, transactions, audit, notifications, clock, limits),
      inject: [
        SOURCES_TOKENS.SOURCES_REPOSITORY,
        SOURCES_TOKENS.IMPORTS_REPOSITORY,
        SOURCES_TOKENS.TABULAR_FILE_READER,
        TOKENS.TRANSACTION_RUNNER,
        TOKENS.AUDIT_RECORDER,
        TOKENS.NOTIFICATION_PUBLISHER,
        TOKENS.CLOCK,
        SOURCES_TOKENS.IMPORT_LIMITS,
      ],
    },
  ],
  exports: [SOURCES_TOKENS.SOURCES_REPOSITORY, SOURCES_TOKENS.IMPORTS_REPOSITORY, SourcesService, ImportsService, ImportProcessor],
})
export class SourcesCoreModule {}

/** HTTP endpoints of sources and imports (API process only). */
@Module({
  imports: [
    SourcesCoreModule,
    MulterModule.registerAsync({
      useFactory: (config: AppConfig) => ({
        // Memory storage (multer default when no storage/dest is given); one file per request.
        limits: { fileSize: config.imports.maxFileBytes, files: 1, fields: 5, parts: 6, headerPairs: 100 },
        defParamCharset: 'utf8',
      }),
      inject: [TOKENS.APP_CONFIG],
    }),
  ],
  controllers: [SourcesController, ImportsController],
})
export class SourcesModule {}
