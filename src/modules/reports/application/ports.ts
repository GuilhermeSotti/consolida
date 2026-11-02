import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Row } from '../../../shared/domain/tabular';

export interface ReportView {
  id: string;
  executionId: string;
  sourceId: string;
  name: string;
  columns: string[];
  rowCount: number;
  createdAt: Date;
  availableAt: Date | null;
  /** Inputs that produced the report (traceability): phase, engine and pinned rule versions. */
  execution: {
    phase: string | null;
    requestedById: string;
    engineVersion: string;
    reproducedFromId: string | null;
    primaryImportId: string;
    rules: Array<{ ruleId: string; ruleVersionId: string; version: number }>;
  };
}

export interface ReportFilter {
  sourceId?: string;
  executionId?: string;
  from?: Date;
  to?: Date;
}

export interface ReportsRepository {
  /** Only AVAILABLE reports are ever returned. */
  list(filter: ReportFilter, page: PageRequest): Promise<Page<ReportView>>;
  findById(id: string): Promise<ReportView | null>;
  readRows(id: string, page: PageRequest): Promise<Row[]>;
  /** Rows in order, one stored chunk at a time (bounded memory for CSV exports). */
  streamRows(id: string): AsyncIterable<Row[]>;
}

export interface SpreadsheetWriter {
  writeXlsx(sheetName: string, columns: readonly string[], rows: readonly Row[]): Uint8Array;
}

export type ExportFormat = 'csv' | 'xlsx';

export interface ReportExportLimits {
  /** Maximum rows × columns for the in-memory XLSX export (CSV is streamed without limit). */
  xlsxMaxCells: number;
}

export interface ExportedFile {
  fileName: string;
  contentType: string;
  content: AsyncIterable<Uint8Array>;
}

export const REPORTS_TOKENS = {
  REPORTS_REPOSITORY: 'ReportsRepository',
  SPREADSHEET_WRITER: 'SpreadsheetWriter',
} as const;
