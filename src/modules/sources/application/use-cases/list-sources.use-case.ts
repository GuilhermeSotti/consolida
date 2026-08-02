import { Injectable } from '@nestjs/common';

import { SourcesRepository } from '../../domain/repositories/sources.repository';
import { QuerySourcesDto } from '../dto/query-sources.dto';

@Injectable()
export class ListSourcesUseCase {
  constructor(private readonly repo: SourcesRepository) {}

  async execute(query?: QuerySourcesDto) {
    const result = await this.repo.findAll(query as any);
    return result;
  }
}
