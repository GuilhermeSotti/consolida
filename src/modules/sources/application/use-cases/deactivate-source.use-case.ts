import { Injectable } from '@nestjs/common';

import { SourcesRepository } from '../../domain/repositories/sources.repository';

@Injectable()
export class DeactivateSourceUseCase {
  constructor(private readonly repo: SourcesRepository) {}

  async execute(id: string) {
    await this.repo.deactivate(id);
  }
}
