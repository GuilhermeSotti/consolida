import { RuleEntity } from '../entities/rule.entity';

export abstract class RulesRepository {
  abstract create(rule: RuleEntity): Promise<RuleEntity>;

  abstract update(rule: RuleEntity): Promise<RuleEntity>;

  abstract findById(id: string): Promise<RuleEntity | null>;

  abstract findAll(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    data: RuleEntity[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;

  abstract deactivate(id: string): Promise<void>;

  abstract findVersions(
    ruleId: string,
    params?: {
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    data: RuleEntity[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;
}
