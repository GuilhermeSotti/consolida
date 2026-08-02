import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

import { SourcesRepository } from '../../domain/repositories/sources.repository';
import { SourceEntity } from '../../domain/entities/source.entity';

@Injectable()
export class PrismaSourcesRepository implements SourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(source: SourceEntity): Promise<SourceEntity> {
    const created = await this.prisma.source.create({
      data: {
        id: source.id,
        name: source.name,
        description: source.description,
        type: source.type,
        status: source.status,
        config: JSON.parse(JSON.stringify(source.config || {})) as Prisma.JsonObject,
        createdBy: source.createdBy,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      },
    });

    return this.mapToDomain(created);
  }

  async update(source: SourceEntity): Promise<SourceEntity> {
    const updated = await this.prisma.source.update({
      where: { id: source.id },
      data: {
        name: source.name,
        description: source.description,
        type: source.type,
        status: source.status,
        config: JSON.parse(JSON.stringify(source.config || {})) as Prisma.JsonObject,
        updatedBy: source.updatedBy,
        updatedAt: source.updatedAt,
      },
    });

    return this.mapToDomain(updated);
  }

  async findById(id: string): Promise<SourceEntity | null> {
    const raw = await this.prisma.source.findUnique({ where: { id } });
    return raw ? this.mapToDomain(raw) : null;
  }

  async findAll(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    data: SourceEntity[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const sortBy = params?.sortBy ?? 'createdAt';
    const sortOrder = params?.sortOrder ?? 'desc';

    const where: any = {};

    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.source.count({ where });

    const items = await this.prisma.source.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
    });

    return {
      data: items.map((x) => this.mapToDomain(x)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.source.update({ where: { id }, data: { status: 'INACTIVE', updatedAt: new Date() } });
  }

  private mapToDomain(raw: any): SourceEntity {
    const e = new SourceEntity();

    e.id = raw.id;
    e.name = raw.name;
    e.description = raw.description;
    e.type = raw.type;
    e.status = raw.status;
    e.config = (raw.config ? JSON.parse(JSON.stringify(raw.config)) : {}) as Record<string, unknown>;
    e.createdBy = raw.createdBy;
    e.updatedBy = raw.updatedBy;
    e.createdAt = raw.createdAt;
    e.updatedAt = raw.updatedAt;

    return e;
  }
}
