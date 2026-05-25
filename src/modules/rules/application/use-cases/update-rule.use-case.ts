import { Injectable, NotFoundException } from '@nestjs/common';

import { UpdateRuleDto } from '../dto/update-rule.dto';
import { RulesRepository } from '../../domain/repositories/rules.repository';

@Injectable()
export class UpdateRuleUseCase {
  constructor(private readonly repository: RulesRepository) {}

  async execute(id: string, dto: UpdateRuleDto, userId: string) {
    const rule = await this.repository.findById(id);

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    if (dto.name !== undefined) {
      rule.name = dto.name;
    }

    if (dto.description !== undefined) {
      rule.description = dto.description;
    }

    if (dto.sourceIds !== undefined) {
      rule.sourceIds = dto.sourceIds;
    }

    if (dto.conditions !== undefined) {
      rule.conditions = dto.conditions;
    }

    if (dto.actions !== undefined) {
      rule.actions = dto.actions;
    }

    if (dto.priority !== undefined) {
      rule.priority = dto.priority;
    }

    if (dto.status !== undefined) {
      rule.status = dto.status;
    }

    rule.updatedBy = userId;
    rule.incrementVersion();

    return this.repository.update(rule);
  }
}
