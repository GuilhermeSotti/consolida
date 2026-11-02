import type { AuditRecorder, TransactionRunner } from '../../../shared/application/ports';
import { NotFoundError } from '../../../shared/domain/errors';
import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Principal } from '../../auth/domain/access-control';
import type { SourceStatus } from '../domain/source';
import type { CreateSourceCommand, SourceFilter, SourcesRepository, SourceView, UpdateSourceCommand } from './ports';

/** Registration of input bases (sources). Every change is audited in the same transaction. */
export class SourcesService {
  constructor(
    private readonly sources: SourcesRepository,
    private readonly transactions: TransactionRunner,
    private readonly audit: AuditRecorder,
  ) {}

  list(filter: SourceFilter, page: PageRequest): Promise<Page<SourceView>> {
    return this.sources.list(filter, page);
  }

  async get(id: string): Promise<SourceView> {
    const source = await this.sources.findById(id);
    if (!source) throw new NotFoundError('Source', id);
    return source;
  }

  create(actor: Principal, command: CreateSourceCommand): Promise<SourceView> {
    return this.transactions.run(async (tx) => {
      const source = await this.sources.create(command, actor.userId, tx);
      await this.audit.record(
        {
          action: 'SOURCE_CREATED',
          entityType: 'Source',
          entityId: source.id,
          outcome: 'SUCCESS',
          details: { code: source.code, fileFormat: source.fileFormat, expectedColumns: source.expectedColumns.length },
        },
        tx,
      );
      return source;
    });
  }

  update(actor: Principal, id: string, changes: UpdateSourceCommand): Promise<SourceView> {
    return this.transactions.run(async (tx) => {
      const current = await this.sources.findById(id, tx);
      if (!current) throw new NotFoundError('Source', id);
      const updated = await this.sources.update(id, changes, actor.userId, tx);
      await this.audit.record(
        { action: 'SOURCE_UPDATED', entityType: 'Source', entityId: id, outcome: 'SUCCESS', details: { changedFields: Object.keys(changes) } },
        tx,
      );
      return updated;
    });
  }

  setStatus(actor: Principal, id: string, status: SourceStatus): Promise<SourceView> {
    return this.transactions.run(async (tx) => {
      const current = await this.sources.findById(id, tx);
      if (!current) throw new NotFoundError('Source', id);
      if (current.status === status) return current;
      const updated = await this.sources.setStatus(id, status, actor.userId, tx);
      await this.audit.record(
        { action: status === 'ACTIVE' ? 'SOURCE_ACTIVATED' : 'SOURCE_DEACTIVATED', entityType: 'Source', entityId: id, outcome: 'SUCCESS' },
        tx,
      );
      return updated;
    });
  }
}
