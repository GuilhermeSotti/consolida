import { ReportEntity } from '../entities/report.entity';

export abstract class ReportsRepository {
  abstract findById(id: string): Promise<ReportEntity | null>;
  abstract findAll(params?: { page?: number; pageSize?: number; status?: string; type?: string }): Promise<{ data: ReportEntity[]; total: number; page: number; pageSize: number; totalPages: number }>;
}
