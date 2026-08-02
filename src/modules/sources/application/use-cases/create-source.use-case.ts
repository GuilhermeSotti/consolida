import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { SourcesRepository } from '../../domain/repositories/sources.repository';
import { CreateSourceDto } from '../dto/create-source.dto';
import { SourceEntity } from '../../domain/entities/source.entity';

@Injectable()
export class CreateSourceUseCase {
  constructor(private readonly repo: SourcesRepository) {}

  async execute(dto: CreateSourceDto, userId: string) {
    const entity = new SourceEntity();
    entity.id = uuidv4();
    entity.name = dto.name;
    entity.description = dto.description;
    entity.type = dto.type;
    entity.status = dto.status ?? 'ACTIVE';
    entity.config = dto.config ?? {};
    entity.createdBy = userId;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    const created = await this.repo.create(entity);

    return created;
  }
}
