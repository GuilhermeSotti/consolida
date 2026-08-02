import { Injectable } from '@nestjs/common';
import { ReportsRepository } from '../../domain/repositories/reports.repository';

@Injectable()
export class GetReportUseCase {
  constructor(private readonly repo: ReportsRepository) {}

  async execute(id: string) {
    const report = await this.repo.findById(id);
    if (!report) throw new Error('Report not found');
    return report;
  }
}
