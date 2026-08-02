import { Injectable } from '@nestjs/common';

import { SourcesRepository } from '../../domain/repositories/sources.repository';
import { UpdateSourceDto } from '../dto/update-source.dto';

@Injectable()
export class UpdateSourceUseCase {
  constructor(private readonly repo: SourcesRepository) {}

  async execute(id: string, dto: UpdateSourceDto, userId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new Error('Source not found');
    }

    existing.name = dto.name ?? existing.name;
    existing.description = dto.description ?? existing.description;
    existing.type = dto.type ?? existing.type;
    existing.status = dto.status ?? existing.status;
    existing.config = dto.config ?? existing.config;
    existing.updatedBy = userId;
    existing.updatedAt = new Date();

    const updated = await this.repo.update(existing);
    return updated;
  }
}
