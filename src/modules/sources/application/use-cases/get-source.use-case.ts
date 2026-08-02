import { Injectable } from '@nestjs/common';

import { SourcesRepository } from '../../domain/repositories/sources.repository';

@Injectable()
export class GetSourceUseCase {
  constructor(private readonly repo: SourcesRepository) {}

  async execute(id: string) {
    const source = await this.repo.findById(id);
    if (!source) {
      throw new Error('Source not found');
    }

    return source;
  }
}
