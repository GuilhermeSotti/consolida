import { Injectable, NotFoundException } from '@nestjs/common';

import { QueryRulesDto } from '../dto/query-rules.dto';
import { RulesRepository } from '../../domain/repositories/rules.repository';

@Injectable()
export class GetRuleVersionsUseCase {
  constructor(private readonly repository: RulesRepository) {}

  async execute(ruleId: string, query: QueryRulesDto) {
    const rule = await this.repository.findById(ruleId);

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    return this.repository.findVersions(ruleId, { page, pageSize });
  }
}
