import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { CreateRuleDto } from '../dto/create-rule.dto';
import { RuleEntity } from '../../domain/entities/rule.entity';
import { RulesRepository } from '../../domain/repositories/rules.repository';

@Injectable()
export class CreateRuleUseCase {
  constructor(private readonly repository: RulesRepository) {}

  async execute(dto: CreateRuleDto, userId: string) {
    const rule = new RuleEntity();

    rule.id = randomUUID();
    rule.name = dto.name;
    rule.description = dto.description;
    rule.version = 1;
    rule.status = dto.status || 'ACTIVE';
    rule.sourceIds = dto.sourceIds;
    rule.conditions = dto.conditions;
    rule.actions = dto.actions;
    rule.priority = dto.priority || 0;
    rule.createdBy = userId;
    rule.createdAt = new Date();
    rule.updatedAt = new Date();

    return this.repository.create(rule);
  }
}
