import type { TransactionContext } from '../../../shared/application/ports';
import type { ErrorDetail } from '../../../shared/domain/errors';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Row } from '../../../shared/domain/tabular';
import type { FileFormat, SourceOrigin, SourceStatus } from '../domain/source';
import type { ExpectedColumn, ImportedColumn } from '../domain/tabular-import';

export interface SourceView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  origin: SourceOrigin;
  fileFormat: FileFormat;
  sheetName: string | null;
  csvDelimiter: string | null;
  expectedColumns: ExpectedColumn[];
  metadata: Record<string, string>;
  status: SourceStatus;
  createdById: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SourceFilter {
  status?: SourceStatus;
  fileFormat?: FileFormat;
  search?: string;
}

export interface CreateSourceCommand {
  code: string;
  name: string;
  description: string | null;
  fileFormat: FileFormat;
  sheetName: string | null;
  csvDelimiter: string | null;
  expectedColumns: ExpectedColumn[];
  metadata: Record<string, string>;
}

export interface UpdateSourceCommand {
  name?: string;
  description?: string | null;
  sheetName?: string | null;
  csvDelimiter?: string | null;
  expectedColumns?: ExpectedColumn[];
  metadata?: Record<string, string>;
}

export interface SourcesRepository {
  list(filter: SourceFilter, page: PageRequest): Promise<Page<SourceView>>;
  findById(id: string, tx?: TransactionContext): Promise<SourceView | null>;
  /** Returns the subset of ids that exist. */
  existingIds(ids: readonly string[], tx?: TransactionContext): Promise<string[]>;
  /** Throws ConflictError(SOURCE_CODE_TAKEN) when the code already exists. */
  create(command: CreateSourceCommand, createdById: string, tx: TransactionContext): Promise<SourceView>;
  update(id: string, changes: UpdateSourceCommand, updatedById: string, tx: TransactionContext): Promise<SourceView>;
  setStatus(id: string, status: SourceStatus, updatedById: string, tx: TransactionContext): Promise<SourceView>;
}

export type ImportStatus = 'RECEIVED' | 'PROCESSING' | 'VALIDATED' | 'REJECTED' | 'FAILED';

export interface ImportView {
  id: string;
  sourceId: string;
  status: ImportStatus;
  fileName: string;
  fileFormat: FileFormat;
  fileSizeBytes: number;
  checksumSha256: string;
  rowCount: number | null;
  columns: ImportedColumn[] | null;
  validationErrors: ErrorDetail[] | null;
  errorMessage: string | null;
  uploadedById: string;
  createdAt: Date;
  processedAt: Date | null;
}

export interface NewImport {
  sourceId: string;
  fileName: string;
  fileFormat: FileFormat;
  fileSizeBytes: number;
  checksumSha256: string;
  uploadedById: string;
  content: Uint8Array;
}

export interface ImportsRepository {
  list(sourceId: string, status: ImportStatus | undefined, page: PageRequest): Promise<Page<ImportView>>;
  findById(id: string, tx?: TransactionContext): Promise<ImportView | null>;
  /**
   * Serializes uploads of the same source until the transaction ends, so that two concurrent
   * uploads of the same file cannot both pass the duplicate check.
   */
  lockSourceForUpload(sourceId: string, tx: TransactionContext): Promise<void>;
  /** An import of the same content that is pending or validated (re-uploading it is pointless). */
  findLiveDuplicate(sourceId: string, checksumSha256: string, tx?: TransactionContext): Promise<ImportView | null>;
  create(input: NewImport, tx: TransactionContext): Promise<ImportView>;
  readRows(importId: string, page: PageRequest): Promise<Row[]>;
  readContent(importId: string): Promise<Uint8Array | null>;
  /** RECEIVED/PROCESSING → PROCESSING; false when the import is already final. */
  markProcessing(importId: string): Promise<boolean>;
  saveValidated(importId: string, result: { columns: ImportedColumn[]; rows: Row[]; processedAt: Date }, tx: TransactionContext): Promise<void>;
  saveRejected(importId: string, issues: ErrorDetail[], processedAt: Date, tx: TransactionContext): Promise<void>;
  saveFailed(importId: string, message: string, processedAt: Date, tx: TransactionContext): Promise<void>;
}

/** Parsed spreadsheet content before normalization. */
export interface TabularContent {
  header: unknown[];
  rows: unknown[][];
  /** Worksheet actually read (XLSX). */
  sheetName?: string;
}

export interface TabularReadOptions {
  sheetName: string | null;
  delimiter: string | null;
  maxRows: number;
  maxColumns: number;
}

export interface TabularFileReader {
  /** Throws TabularFormatError for content problems (reported to the user as a rejection). */
  read(content: Uint8Array, format: FileFormat, options: TabularReadOptions): TabularContent;
}

export class TabularFormatError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = 'TabularFormatError';
  }
}

export interface ImportLimits {
  maxFileBytes: number;
  maxRows: number;
  maxColumns: number;
}

export const SOURCES_TOKENS = {
  SOURCES_REPOSITORY: 'SourcesRepository',
  IMPORTS_REPOSITORY: 'ImportsRepository',
  TABULAR_FILE_READER: 'TabularFileReader',
  IMPORT_LIMITS: 'ImportLimits',
} as const;
