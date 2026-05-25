import { Injectable, NotFoundException } from '@nestjs/common';

import { RulesRepository } from '../../domain/repositories/rules.repository';

@Injectable()
export class ActivateRuleUseCase {
  constructor(private readonly repository: RulesRepository) {}

  async execute(id: string) {
    const rule = await this.repository.findById(id);

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    rule.status = 'ACTIVE';
    rule.updatedAt = new Date();

    await this.repository.update(rule);

    return rule;
  }
}
