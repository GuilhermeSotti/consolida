import { Injectable } from '@nestjs/common';
import { ReportsRepository } from '../../domain/repositories/reports.repository';

@Injectable()
export class ListReportsUseCase {
  constructor(private readonly repo: ReportsRepository) {}

  async execute(params?: { page?: number; pageSize?: number; status?: string; type?: string }) {
    return this.repo.findAll(params);
  }
}
