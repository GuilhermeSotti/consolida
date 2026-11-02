import type { AuditRecorder, JobQueue, TransactionRunner } from '../../../shared/application/ports';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/domain/errors';
import { sha256Hex } from '../../../shared/domain/hashing';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Row } from '../../../shared/domain/tabular';
import type { Principal } from '../../auth/domain/access-control';
import { FILE_EXTENSIONS, hasAllowedExtension, looksLike, sanitizeFileName } from '../domain/source';
import type { ImportLimits, ImportStatus, ImportsRepository, ImportView, SourcesRepository } from './ports';

export interface UploadedFile {
  originalName: string;
  size: number;
  content: Uint8Array;
}

/**
 * Receives files for a source. The upload only stores the original bytes and enqueues the
 * validation job; parsing happens in the worker, so a large or malformed file never blocks the API.
 */
export class ImportsService {
  constructor(
    private readonly sources: SourcesRepository,
    private readonly imports: ImportsRepository,
    private readonly transactions: TransactionRunner,
    private readonly audit: AuditRecorder,
    private readonly jobs: JobQueue,
    private readonly limits: ImportLimits,
  ) {}

  async upload(actor: Principal, sourceId: string, file: UploadedFile | undefined): Promise<ImportView> {
    const source = await this.sources.findById(sourceId);
    if (!source) throw new NotFoundError('Source', sourceId);
    if (source.status !== 'ACTIVE') throw new ConflictError('SOURCE_INACTIVE', 'A fonte está inativa e não aceita novas cargas.');
    if (!file || file.size === 0 || file.content.length === 0) {
      throw new ValidationError('Arquivo ausente ou vazio.', [{ field: 'file', message: 'Envie um arquivo no campo "file".', code: 'REQUIRED' }]);
    }
    if (file.content.length > this.limits.maxFileBytes) {
      throw new ValidationError('Arquivo maior que o limite.', [
        { field: 'file', message: `Limite de ${this.limits.maxFileBytes} bytes.`, code: 'TOO_LARGE' },
      ]);
    }
    const fileName = sanitizeFileName(file.originalName) || `carga.${source.fileFormat.toLowerCase()}`;
    if (!hasAllowedExtension(fileName, source.fileFormat) || !looksLike(source.fileFormat, file.content)) {
      throw new ValidationError('Formato de arquivo incompatível com a fonte.', [
        {
          field: 'file',
          message: `A fonte espera ${source.fileFormat} (${FILE_EXTENSIONS[source.fileFormat].join(', ')}).`,
          code: 'UNSUPPORTED_FORMAT',
        },
      ]);
    }
    const checksumSha256 = sha256Hex(file.content);

    return this.transactions.run(async (tx) => {
      await this.imports.lockSourceForUpload(sourceId, tx);
      // Re-checked under the lock: a deactivation committed meanwhile is honoured.
      const locked = await this.sources.findById(sourceId, tx);
      if (!locked || locked.status !== 'ACTIVE') throw new ConflictError('SOURCE_INACTIVE', 'A fonte está inativa e não aceita novas cargas.');
      const duplicate = await this.imports.findLiveDuplicate(sourceId, checksumSha256, tx);
      if (duplicate) {
        throw new ConflictError('DUPLICATE_IMPORT', 'Este arquivo já foi recebido para esta fonte.', [
          { field: 'file', message: `Carga existente: ${duplicate.id} (${duplicate.status}).`, code: 'DUPLICATE' },
        ]);
      }
      const created = await this.imports.create(
        {
          sourceId,
          fileName,
          fileFormat: source.fileFormat,
          fileSizeBytes: file.content.length,
          checksumSha256,
          uploadedById: actor.userId,
          content: file.content,
        },
        tx,
      );
      await this.jobs.enqueue({ type: 'PROCESS_IMPORT', payload: { importId: created.id } }, tx);
      await this.audit.record(
        {
          action: 'IMPORT_RECEIVED',
          entityType: 'DataImport',
          entityId: created.id,
          outcome: 'SUCCESS',
          details: { sourceId, fileName, fileSizeBytes: created.fileSizeBytes, checksumSha256 },
        },
        tx,
      );
      return created;
    });
  }

  async list(sourceId: string, status: ImportStatus | undefined, page: PageRequest): Promise<Page<ImportView>> {
    const source = await this.sources.findById(sourceId);
    if (!source) throw new NotFoundError('Source', sourceId);
    return this.imports.list(sourceId, status, page);
  }

  async get(id: string): Promise<ImportView> {
    const found = await this.imports.findById(id);
    if (!found) throw new NotFoundError('DataImport', id);
    return found;
  }

  /** Preview of the normalized rows (only for validated imports). */
  async rows(id: string, page: PageRequest): Promise<Page<Row>> {
    const found = await this.get(id);
    if (found.status !== 'VALIDATED') {
      throw new ConflictError('IMPORT_NOT_VALIDATED', 'As linhas só ficam disponíveis após a validação da carga.');
    }
    const items = await this.imports.readRows(id, page);
    return { items, page: page.page, pageSize: page.pageSize, totalItems: found.rowCount ?? 0 };
  }
}
