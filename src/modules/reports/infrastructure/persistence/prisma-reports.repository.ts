import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { ReportsRepository } from '../../domain/repositories/reports.repository';
import { ReportEntity } from '../../domain/entities/report.entity';

@Injectable()
export class PrismaReportsRepository implements ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDomain(raw: any): ReportEntity {
    const report = new ReportEntity();
    report.id = raw.id;
    report.name = raw.name;
    report.description = raw.description;
    report.type = raw.type;
    report.status = raw.status;
    report.data = raw.data;
    report.createdBy = raw.createdBy;
    report.createdAt = raw.createdAt;
    report.updatedAt = raw.updatedAt;
    return report;
  }

  async findById(id: string): Promise<ReportEntity | null> {
    const raw = await this.prisma.report.findUnique({ where: { id } });
    return raw ? this.mapToDomain(raw) : null;
  }

  async findAll(params?: { page?: number; pageSize?: number; status?: string; type?: string }) {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const where: any = {};
    if (params?.status) where.status = params.status;
    if (params?.type) where.type = params.type;
    const total = await this.prisma.report.count({ where });
    const items = await this.prisma.report.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } });
    return {
      data: items.map(this.mapToDomain),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
