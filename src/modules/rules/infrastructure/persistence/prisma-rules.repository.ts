import { Injectable } from '@nestjs/common';
import type { Rule } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

import { RuleEntity } from '../../domain/entities/rule.entity';
import { RulesRepository } from '../../domain/repositories/rules.repository';

@Injectable()
export class PrismaRulesRepository implements RulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(rule: RuleEntity): Promise<RuleEntity> {
    const created = await this.prisma.rule.create({
      data: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        version: rule.version,
        status: rule.status,
        sourceIds: rule.sourceIds,
        conditions: rule.conditions,
        actions: rule.actions,
        priority: rule.priority,
        createdBy: rule.createdBy,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      },
    });

    return this.mapToDomain(created);
  }

  async update(rule: RuleEntity): Promise<RuleEntity> {
    const updated = await this.prisma.rule.update({
      where: {
        id: rule.id,
      },
      data: {
        name: rule.name,
        description: rule.description,
        version: rule.version,
        status: rule.status,
        sourceIds: rule.sourceIds,
        conditions: rule.conditions,
        actions: rule.actions,
        priority: rule.priority,
        updatedBy: rule.updatedBy,
        updatedAt: rule.updatedAt,
      },
    });

    return this.mapToDomain(updated);
  }

  async findById(id: string): Promise<RuleEntity | null> {
    const rule = await this.prisma.rule.findUnique({
      where: {
        id,
      },
    });

    return rule ? this.mapToDomain(rule) : null;
  }

  async findAll(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    data: RuleEntity[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const sortBy = params?.sortBy ?? 'createdAt';
    const sortOrder = params?.sortOrder ?? 'desc';

    const where: Prisma.RuleWhereInput = {};

    if (params?.status) {
      where.status = params.status;
    }

    if (params?.search) {
      where.OR = [
        {
          name: {
            contains: params.search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: params.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const total = await this.prisma.rule.count({ where });

    const rules = await this.prisma.rule.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    return {
      data: rules.map((rule) => this.mapToDomain(rule)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.rule.update({
      where: { id },
      data: {
        status: 'INACTIVE',
        updatedAt: new Date(),
      },
    });
  }

  async findVersions(
    ruleId: string,
    params?: {
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    data: RuleEntity[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;

    const total = await this.prisma.rule.count({
      where: { id: ruleId },
    });

    const rules = await this.prisma.rule.findMany({
      where: { id: ruleId },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: {
        version: 'desc',
      },
    });

    return {
      data: rules.map((rule) => this.mapToDomain(rule)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private mapToDomain(raw: Rule): RuleEntity {
    const rule = new RuleEntity();

    rule.id = raw.id;
    rule.name = raw.name;
    rule.description = raw.description;
    rule.version = raw.version;
    rule.status = raw.status;
    rule.sourceIds = raw.sourceIds || [];
    rule.conditions = raw.conditions || {};
    rule.actions = raw.actions || {};
    rule.priority = raw.priority || 0;
    rule.createdBy = raw.createdBy;
    rule.updatedBy = raw.updatedBy;
    rule.createdAt = raw.createdAt;
    rule.updatedAt = raw.updatedAt;

    return rule;
  }
}
