import { Injectable, NotFoundException } from '@nestjs/common';

import { RulesRepository } from '../../domain/repositories/rules.repository';

@Injectable()
export class DeactivateRuleUseCase {
  constructor(private readonly repository: RulesRepository) {}

  async execute(id: string) {
    const rule = await this.repository.findById(id);

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    rule.deactivate();

    await this.repository.update(rule);
  }
}
