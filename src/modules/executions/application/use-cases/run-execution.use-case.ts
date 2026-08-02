import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { ExcelLoaderService } from '../../..//loaders/services/excel-loader.service';
import { SqlLoaderService } from '../../../loaders/services/sql-loader.service';
import { SharepointLoaderService } from '../../../loaders/services/sharepoint-loader.service';
import { RuleApplierService } from '../../../rules/application/services/rule-applier.service';

/**
 * Orchestrator scaffold for running executions.
 * Steps:
 *  - Load configuration and tables for the requested configurationId
 *  - For each DataTable, resolve Source and load data via appropriate loader
 *  - Apply rules using a simple RuleApplier (placeholder)
 *  - Persist Execution and Report records
 */
@Injectable()
export class RunExecutionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelLoader: ExcelLoaderService,
    private readonly sqlLoader: SqlLoaderService,
    private readonly spLoader: SharepointLoaderService,
    private readonly ruleApplier: RuleApplierService,
  ) {}

  async execute(input: { configurationId: string; runBy: string }) {
    const { configurationId, runBy } = input;

    // Create execution record
    const executionRecord = await this.prisma.execution.create({
      data: {
        ruleId: '',
        sourceId: '',
        status: 'RUNNING',
        startedAt: new Date(),
        createdAt: new Date(),
      },
    });

    const ctx = { executionId: executionRecord.id };

    try {
      // Load configuration (phases and tables)
      const configuration = await this.prisma.configuration.findUnique({
        where: { id: configurationId },
        include: { phases: { orderBy: { order: 'asc' } } },
      });

      if (!configuration) throw new Error('Configuration not found');

      // Collect tables for all databases in configuration (simplified)
      const tables = await this.prisma.dataTable.findMany({ where: {} });

      const loadedTables: Record<string, any[]> = {};

      for (const table of tables) {
        if (!table.sourceId) continue;
        const source = await this.prisma.source.findUnique({ where: { id: table.sourceId } });
        if (!source) continue;

        if (source.type === 'excel') {
          // fetch file via sharepoint or direct path
          // placeholder: throw until implemented
          await this.excelLoader.load('path-or-buffer');
        } else if (source.type === 'sql') {
          await this.sqlLoader.query(source.config as any, 'SELECT 1');
        } else if (source.type === 'sharepoint') {
          await this.spLoader.fetchFile(source.config as any, 'path');
        }

        // Placeholder: store empty dataset
        loadedTables[table.id] = [];
      }

      // Placeholder for rule application and consolidation
      const rules = await this.prisma.rule.findMany({ where: { status: 'ACTIVE' }, orderBy: { priority: 'desc' } });
      const consolidated = this.ruleApplier.applyRules([], rules);

      // Persist report
      const report = await this.prisma.report.create({
        data: {
          name: `Execution Report ${new Date().toISOString()}`,
          description: 'Auto-generated report',
          type: 'consolidated',
          status: 'COMPLETED',
          data: consolidated,
          createdBy: runBy,
          createdAt: new Date(),
        },
      });

      // Update execution with result
      await this.prisma.execution.update({
        where: { id: executionRecord.id },
        data: {
          status: 'COMPLETED',
          result: { reportId: report.id },
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { executionId: executionRecord.id, reportId: report.id };
    } catch (error) {
      await this.prisma.execution.update({ where: { id: executionRecord.id }, data: { status: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error), completedAt: new Date(), updatedAt: new Date() } });
      throw error;
    }
  }
}
