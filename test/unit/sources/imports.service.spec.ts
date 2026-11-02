import { ImportProcessor } from '../../../src/modules/sources/application/import-processor';
import { ImportsService } from '../../../src/modules/sources/application/imports.service';
import { TabularFormatError, type TabularFileReader } from '../../../src/modules/sources/application/ports';
import type { TransactionContext } from '../../../src/shared/application/ports';
import { ConflictError, NotFoundError, ValidationError } from '../../../src/shared/domain/errors';
import { sha256Hex } from '../../../src/shared/domain/hashing';
import { failure, FakeAudit, FakeJobs, FakeNotifications, FakeTransactions, FixedClock, principal, uuid } from '../../support/fakes';
import { InMemoryImports, InMemorySources, sourceView } from '../../support/in-memory-sources';
import { CsvFormatError, parseCsv } from '../../../src/modules/sources/infrastructure/parsers/csv.parser';

const LIMITS = { maxFileBytes: 1024, maxRows: 100, maxColumns: 50 };
const csv = (text: string) => new TextEncoder().encode(text);
const analyst = principal(['OPERATIONS']);

/** Real CSV parsing through the reader port (XLSX is not exercised in these unit tests). */
const csvReader: TabularFileReader = {
  read(content, _format, options) {
    try {
      const table = parseCsv(content, { maxRows: options.maxRows, maxColumns: options.maxColumns });
      return { header: table.header, rows: table.rows };
    } catch (error) {
      if (error instanceof CsvFormatError) throw new TabularFormatError(error.code, error.message, error.line);
      throw error;
    }
  },
};

function setup() {
  const sources = new InMemorySources();
  const imports = new InMemoryImports();
  const audit = new FakeAudit();
  const jobs = new FakeJobs();
  const notifications = new FakeNotifications();
  const transactions = new FakeTransactions();
  const source = sources.add(sourceView({ expectedColumns: [{ name: 'NF', required: true }, { name: 'VALOR', required: false }] }));
  const service = new ImportsService(sources, imports, transactions, audit, jobs, LIMITS);
  const processor = new ImportProcessor(sources, imports, csvReader, transactions, audit, notifications, new FixedClock(), LIMITS);
  return { sources, imports, audit, jobs, notifications, source, service, processor };
}

describe('ImportsService.upload', () => {
  it('stores the file, enqueues validation and audits — all in one transaction', async () => {
    const { service, source, jobs, audit, imports } = setup();
    const content = csv('NF;VALOR\n1;10\n');
    const created = await service.upload(analyst, source.id, { originalName: 'C:\\temp\\notas.csv', size: content.length, content });
    // Uploads of the same source are serialized before the duplicate check.
    expect(imports.uploadLocks).toEqual([source.id]);
    expect(created).toEqual(expect.objectContaining({ status: 'RECEIVED', fileName: 'notas.csv', checksumSha256: sha256Hex(content) }));
    expect(jobs.jobs).toEqual([{ type: 'PROCESS_IMPORT', payload: { importId: created.id }, inTransaction: true }]);
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'IMPORT_RECEIVED', entityId: created.id, inTransaction: true })]);
  });

  it('rejects missing, oversized and mismatching files', async () => {
    const { service, source } = setup();
    expect(await failure(service.upload(analyst, source.id, undefined))).toBeInstanceOf(ValidationError);
    const big = new Uint8Array(LIMITS.maxFileBytes + 1).fill(65);
    expect((await failure(service.upload(analyst, source.id, { originalName: 'a.csv', size: big.length, content: big }))).message).toContain('limite');
    const xlsxBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2]);
    const wrong = await failure(service.upload(analyst, source.id, { originalName: 'planilha.xlsx', size: 6, content: xlsxBytes }));
    expect(wrong.details).toEqual([expect.objectContaining({ code: 'UNSUPPORTED_FORMAT' })]);
    const binary = Uint8Array.from([0x41, 0x00, 0x42]);
    expect(await failure(service.upload(analyst, source.id, { originalName: 'x.csv', size: 3, content: binary }))).toBeInstanceOf(ValidationError);
  });

  it('refuses uploads to inactive or unknown sources and duplicated content', async () => {
    const { service, sources, source, imports } = setup();
    expect(await failure(service.upload(analyst, uuid(5), undefined))).toBeInstanceOf(NotFoundError);
    const content = csv('NF\n1\n');
    imports.add({ sourceId: source.id, status: 'VALIDATED', checksumSha256: sha256Hex(content) });
    const duplicate = await failure(service.upload(analyst, source.id, { originalName: 'a.csv', size: content.length, content }));
    expect(duplicate).toBeInstanceOf(ConflictError);
    expect(duplicate.code).toBe('DUPLICATE_IMPORT');
    sources.add({ ...source, status: 'INACTIVE' });
    expect((await failure(service.upload(analyst, source.id, { originalName: 'b.csv', size: 4, content: csv('NF\n2') }))).code).toBe('SOURCE_INACTIVE');
  });

  it('re-checks the source under the upload lock (deactivation committed meanwhile)', async () => {
    const { service, source, sources, imports } = setup();
    const read = sources.findById.bind(sources);
    sources.findById = async (id: string, tx?: TransactionContext) => {
      const found = await read(id);
      return tx && found ? { ...found, status: 'INACTIVE' } : found;
    };
    const content = csv('NF;VALOR\n1;10\n');
    const error = await failure(service.upload(analyst, source.id, { originalName: 'notas.csv', size: content.length, content }));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('SOURCE_INACTIVE');
    expect(imports.imports.size).toBe(0);
  });

  it('accepts re-uploading content that was previously rejected', async () => {
    const { service, source, imports } = setup();
    const content = csv('NF\n1\n');
    imports.add({ sourceId: source.id, status: 'REJECTED', checksumSha256: sha256Hex(content) });
    await expect(service.upload(analyst, source.id, { originalName: 'a.csv', size: content.length, content })).resolves.toBeDefined();
  });
});

describe('ImportProcessor', () => {
  it('validates, stores normalized rows and notifies the uploader', async () => {
    const { processor, imports, source, notifications, audit } = setup();
    const item = imports.add({ sourceId: source.id }, csv('nf;valor\n001;10,5\n002;\n'));
    await processor.process(item.id);
    const stored = imports.imports.get(item.id)!;
    expect(stored.status).toBe('VALIDATED');
    expect(stored.rowCount).toBe(2);
    expect(imports.rows.get(item.id)).toEqual([
      { NF: '001', VALOR: '10,5', FILE_ID: 'dados.csv', VOLUME: 1 },
      { NF: '002', VALOR: null, FILE_ID: 'dados.csv', VOLUME: 1 },
    ]);
    expect(notifications.sent).toEqual([expect.objectContaining({ type: 'IMPORT_VALIDATED', userId: item.uploadedById, inTransaction: true })]);
    expect(audit.actions()).toEqual(['IMPORT_VALIDATED']);
  });

  it('rejects files without the required columns', async () => {
    const { processor, imports, source, notifications } = setup();
    const item = imports.add({ sourceId: source.id }, csv('VALOR\n10\n'));
    await processor.process(item.id);
    const stored = imports.imports.get(item.id)!;
    expect(stored.status).toBe('REJECTED');
    expect(stored.validationErrors).toEqual([expect.objectContaining({ code: 'MISSING_COLUMN' })]);
    expect(notifications.sent[0].type).toBe('IMPORT_REJECTED');
  });

  it('rejects malformed content and header-only files', async () => {
    const { processor, imports, source } = setup();
    const malformed = imports.add({ sourceId: source.id }, csv('NF\n"aberto\n'));
    await processor.process(malformed.id);
    expect(imports.imports.get(malformed.id)!.validationErrors).toEqual([expect.objectContaining({ code: 'UNTERMINATED_QUOTE' })]);
    const empty = imports.add({ sourceId: source.id }, csv('NF;VALOR\n'));
    await processor.process(empty.id);
    expect(imports.imports.get(empty.id)!.validationErrors).toEqual([expect.objectContaining({ code: 'NO_DATA_ROWS' })]);
  });

  it('is idempotent: final imports are not processed again', async () => {
    const { processor, imports, source, notifications } = setup();
    const item = imports.add({ sourceId: source.id, status: 'VALIDATED' }, csv('NF\n1\n'));
    await processor.process(item.id);
    expect(notifications.sent).toHaveLength(0);
  });

  it('marks the import FAILED when every attempt failed', async () => {
    const { processor, imports, source, audit } = setup();
    const item = imports.add({ sourceId: source.id, status: 'PROCESSING' }, csv('NF\n1\n'));
    await processor.fail(item.id, 'boom');
    expect(imports.imports.get(item.id)!.status).toBe('FAILED');
    expect(audit.actions()).toEqual(['IMPORT_FAILED']);
  });
});
