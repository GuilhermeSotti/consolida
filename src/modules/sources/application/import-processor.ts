import type { AuditRecorder, Clock, NotificationPublisher, TransactionRunner } from '../../../shared/application/ports';
import type { ErrorDetail } from '../../../shared/domain/errors';
import { normalizeTabularImport } from '../domain/tabular-import';
import {
  ImportLimits,
  ImportsRepository,
  SourcesRepository,
  TabularFileReader,
  TabularFormatError,
} from './ports';

/**
 * Worker-side validation of an import (job PROCESS_IMPORT). Idempotent: final imports are
 * skipped, and the normalized rows are written together with the VALIDATED status in a single
 * transaction, so a crash never leaves a partially loaded import visible.
 */
export class ImportProcessor {
  constructor(
    private readonly sources: SourcesRepository,
    private readonly imports: ImportsRepository,
    private readonly reader: TabularFileReader,
    private readonly transactions: TransactionRunner,
    private readonly audit: AuditRecorder,
    private readonly notifications: NotificationPublisher,
    private readonly clock: Clock,
    private readonly limits: ImportLimits,
  ) {}

  async process(importId: string): Promise<void> {
    const current = await this.imports.findById(importId);
    if (!current) return;
    if (!(await this.imports.markProcessing(importId))) return;
    const source = await this.sources.findById(current.sourceId);
    const content = await this.imports.readContent(importId);
    if (!source || !content) {
      await this.reject(importId, current.uploadedById, current.fileName, [
        { code: 'CONTENT_UNAVAILABLE', message: 'Conteúdo da carga ou fonte não encontrado.' },
      ]);
      return;
    }

    let parsed;
    try {
      parsed = this.reader.read(content, current.fileFormat, {
        sheetName: source.sheetName,
        delimiter: source.csvDelimiter,
        maxRows: this.limits.maxRows,
        maxColumns: this.limits.maxColumns,
      });
    } catch (error) {
      if (error instanceof TabularFormatError) {
        await this.reject(importId, current.uploadedById, current.fileName, [
          { code: error.code, message: error.message, field: error.line !== undefined ? `linha ${error.line}` : undefined },
        ]);
        return;
      }
      throw error;
    }

    const normalized = normalizeTabularImport({
      header: parsed.header,
      rows: parsed.rows,
      fileId: current.fileName,
      expectedColumns: source.expectedColumns,
    });
    if (normalized.issues.length > 0) {
      await this.reject(importId, current.uploadedById, current.fileName, normalized.issues);
      return;
    }
    if (normalized.dataset.rows.length === 0) {
      await this.reject(importId, current.uploadedById, current.fileName, [
        { code: 'NO_DATA_ROWS', message: 'O arquivo não contém linhas de dados abaixo do cabeçalho.' },
      ]);
      return;
    }

    const processedAt = this.clock.now();
    await this.transactions.run(
      async (tx) => {
        await this.imports.saveValidated(importId, { columns: normalized.columns, rows: normalized.dataset.rows, processedAt }, tx);
        await this.notifications.notify(
          {
            userId: current.uploadedById,
            type: 'IMPORT_VALIDATED',
            title: 'Carga validada',
            message: `O arquivo ${current.fileName} foi validado com ${normalized.dataset.rows.length} linha(s).`,
            entityType: 'DataImport',
            entityId: importId,
          },
          tx,
        );
        await this.audit.record(
          {
            action: 'IMPORT_VALIDATED',
            entityType: 'DataImport',
            entityId: importId,
            outcome: 'SUCCESS',
            actorUserId: null,
            details: { sourceId: current.sourceId, rowCount: normalized.dataset.rows.length, columns: normalized.columns.length, sheetName: parsed.sheetName },
          },
          tx,
        );
      },
      { timeoutMs: 120_000 },
    );
  }

  /** Called by the job runner when every attempt failed with an unexpected error. */
  async fail(importId: string, reason: string): Promise<void> {
    const current = await this.imports.findById(importId);
    if (!current || current.status === 'VALIDATED' || current.status === 'REJECTED' || current.status === 'FAILED') return;
    await this.transactions.run(async (tx) => {
      await this.imports.saveFailed(importId, reason, this.clock.now(), tx);
      await this.notifications.notify(
        {
          userId: current.uploadedById,
          type: 'IMPORT_REJECTED',
          title: 'Falha no processamento da carga',
          message: `Não foi possível processar o arquivo ${current.fileName}. Tente novamente ou acione o suporte.`,
          entityType: 'DataImport',
          entityId: importId,
        },
        tx,
      );
      await this.audit.record({ action: 'IMPORT_FAILED', entityType: 'DataImport', entityId: importId, outcome: 'FAILURE', actorUserId: null }, tx);
    });
  }

  private async reject(importId: string, uploadedById: string, fileName: string, issues: ErrorDetail[]): Promise<void> {
    await this.transactions.run(async (tx) => {
      await this.imports.saveRejected(importId, issues, this.clock.now(), tx);
      await this.notifications.notify(
        {
          userId: uploadedById,
          type: 'IMPORT_REJECTED',
          title: 'Carga rejeitada',
          message: `O arquivo ${fileName} foi rejeitado: ${issues[0]?.message ?? 'conteúdo inválido'}${issues.length > 1 ? ` (+${issues.length - 1} problema(s))` : ''}.`,
          entityType: 'DataImport',
          entityId: importId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'IMPORT_REJECTED',
          entityType: 'DataImport',
          entityId: importId,
          outcome: 'FAILURE',
          actorUserId: null,
          details: { issues: issues.slice(0, 10) },
        },
        tx,
      );
    });
  }
}
