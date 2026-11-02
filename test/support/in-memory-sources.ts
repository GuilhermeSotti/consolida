import type {
  CreateSourceCommand,
  ImportsRepository,
  ImportStatus,
  ImportView,
  NewImport,
  SourceFilter,
  SourcesRepository,
  SourceView,
  UpdateSourceCommand,
} from '../../src/modules/sources/application/ports';
import type { SourceStatus } from '../../src/modules/sources/domain/source';
import type { ImportedColumn } from '../../src/modules/sources/domain/tabular-import';
import { ConflictError, type ErrorDetail } from '../../src/shared/domain/errors';
import type { Page, PageRequest } from '../../src/shared/domain/pagination';
import type { Row } from '../../src/shared/domain/tabular';
import { uuid } from './fakes';

let sequence = 100;

export function sourceView(overrides: Partial<SourceView> = {}): SourceView {
  return {
    id: uuid(sequence++),
    code: 'NOTAS',
    name: 'Notas fiscais',
    description: null,
    origin: 'FILE_UPLOAD',
    fileFormat: 'CSV',
    sheetName: null,
    csvDelimiter: null,
    expectedColumns: [],
    metadata: {},
    status: 'ACTIVE',
    createdById: uuid(900),
    updatedById: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

export class InMemorySources implements SourcesRepository {
  readonly sources = new Map<string, SourceView>();

  add(source: SourceView): SourceView {
    this.sources.set(source.id, source);
    return source;
  }
  async list(_filter: SourceFilter, page: PageRequest): Promise<Page<SourceView>> {
    return { items: [...this.sources.values()], page: page.page, pageSize: page.pageSize, totalItems: this.sources.size };
  }
  async findById(id: string): Promise<SourceView | null> {
    return this.sources.get(id) ?? null;
  }
  async existingIds(ids: readonly string[]): Promise<string[]> {
    return ids.filter((id) => this.sources.has(id));
  }
  async create(command: CreateSourceCommand, createdById: string): Promise<SourceView> {
    if ([...this.sources.values()].some((source) => source.code === command.code)) throw new ConflictError('SOURCE_CODE_TAKEN', 'taken');
    return this.add(sourceView({ ...command, createdById }));
  }
  async update(id: string, changes: UpdateSourceCommand, updatedById: string): Promise<SourceView> {
    const updated = { ...this.sources.get(id)!, ...changes, updatedById };
    this.sources.set(id, updated);
    return updated;
  }
  async setStatus(id: string, status: SourceStatus, updatedById: string): Promise<SourceView> {
    return this.update(id, {}, updatedById).then((source) => {
      const next = { ...source, status };
      this.sources.set(id, next);
      return next;
    });
  }
}

export class InMemoryImports implements ImportsRepository {
  readonly imports = new Map<string, ImportView>();
  readonly contents = new Map<string, Uint8Array>();
  readonly rows = new Map<string, Row[]>();

  add(view: Partial<ImportView> & { sourceId: string }, content?: Uint8Array, rows?: Row[]): ImportView {
    const full: ImportView = {
      id: uuid(sequence++),
      status: 'RECEIVED',
      fileName: 'dados.csv',
      fileFormat: 'CSV',
      fileSizeBytes: content?.length ?? 0,
      checksumSha256: 'x'.repeat(64),
      rowCount: rows?.length ?? null,
      columns: null,
      validationErrors: null,
      errorMessage: null,
      uploadedById: uuid(900),
      createdAt: new Date('2026-10-20T00:00:00Z'),
      processedAt: null,
      ...view,
    };
    this.imports.set(full.id, full);
    if (content) this.contents.set(full.id, content);
    if (rows) this.rows.set(full.id, rows);
    return full;
  }
  async list(sourceId: string, status: ImportStatus | undefined, page: PageRequest): Promise<Page<ImportView>> {
    const items = [...this.imports.values()].filter((item) => item.sourceId === sourceId && (!status || item.status === status));
    return { items, page: page.page, pageSize: page.pageSize, totalItems: items.length };
  }
  async findById(id: string): Promise<ImportView | null> {
    return this.imports.get(id) ?? null;
  }
  readonly uploadLocks: string[] = [];
  async lockSourceForUpload(sourceId: string): Promise<void> {
    this.uploadLocks.push(sourceId);
  }
  async findLiveDuplicate(sourceId: string, checksum: string): Promise<ImportView | null> {
    return (
      [...this.imports.values()].find(
        (item) => item.sourceId === sourceId && item.checksumSha256 === checksum && ['RECEIVED', 'PROCESSING', 'VALIDATED'].includes(item.status),
      ) ?? null
    );
  }
  async create(input: NewImport): Promise<ImportView> {
    const { content, ...rest } = input;
    return this.add({ ...rest, status: 'RECEIVED' }, content);
  }
  async readRows(importId: string, page: PageRequest): Promise<Row[]> {
    const start = (page.page - 1) * page.pageSize;
    return (this.rows.get(importId) ?? []).slice(start, start + page.pageSize);
  }
  async readContent(importId: string): Promise<Uint8Array | null> {
    return this.contents.get(importId) ?? null;
  }
  async markProcessing(importId: string): Promise<boolean> {
    const item = this.imports.get(importId);
    if (!item || !['RECEIVED', 'PROCESSING'].includes(item.status)) return false;
    item.status = 'PROCESSING';
    return true;
  }
  async saveValidated(importId: string, result: { columns: ImportedColumn[]; rows: Row[]; processedAt: Date }): Promise<void> {
    const item = this.imports.get(importId)!;
    Object.assign(item, { status: 'VALIDATED', columns: result.columns, rowCount: result.rows.length, processedAt: result.processedAt });
    this.rows.set(importId, result.rows);
  }
  async saveRejected(importId: string, issues: ErrorDetail[], processedAt: Date): Promise<void> {
    Object.assign(this.imports.get(importId)!, { status: 'REJECTED', validationErrors: issues, processedAt });
  }
  async saveFailed(importId: string, message: string, processedAt: Date): Promise<void> {
    Object.assign(this.imports.get(importId)!, { status: 'FAILED', errorMessage: message, processedAt });
  }
}
