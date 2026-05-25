import { Injectable } from '@nestjs/common';

import { QueryRulesDto } from '../dto/query-rules.dto';
import { RulesRepository } from '../../domain/repositories/rules.repository';

@Injectable()
export class ListRulesUseCase {
  constructor(private readonly repository: RulesRepository) {}

  async execute(query: QueryRulesDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    return this.repository.findAll({
      page,
      pageSize,
      status: query.status,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }
}
