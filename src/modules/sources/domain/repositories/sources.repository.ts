import { SourceEntity } from '../entities/source.entity';

export abstract class SourcesRepository {
  abstract create(source: SourceEntity): Promise<SourceEntity>;

  abstract update(source: SourceEntity): Promise<SourceEntity>;

  abstract findById(id: string): Promise<SourceEntity | null>;

  abstract findAll(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    data: SourceEntity[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;

  abstract deactivate(id: string): Promise<void>;
}
