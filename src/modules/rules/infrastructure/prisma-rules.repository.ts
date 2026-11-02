import { Injectable } from '@nestjs/common';
import { Prisma, type RuleVersion } from '@prisma/client';
import type { TransactionContext } from '../../../shared/application/ports';
import { Page, PageRequest, toSkipTake } from '../../../shared/domain/pagination';
import { db, json } from '../../../shared/infrastructure/prisma/prisma-client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { NewRule, RuleContent, RuleFilter, RulesRepository, RuleStatus, RuleVersionView, RuleView } from '../application/ports';
import type { ExecutableRule, RuleType } from '../domain/rule-definition';
import { parseRuleDefinition } from '../domain/rule-definition.parser';

const RULE_INCLUDE = {
  versions: { orderBy: { version: 'desc' }, take: 1 },
} satisfies Prisma.RuleInclude;

type RuleRow = Prisma.RuleGetPayload<{ include: typeof RULE_INCLUDE }>;

function toVersionView(type: RuleType, row: RuleVersion): RuleVersionView {
  return {
    id: row.id,
    ruleId: row.ruleId,
    version: row.version,
    name: row.name,
    description: row.description,
    phase: row.phase,
    executionOrder: row.executionOrder,
    // Persisted definitions are re-validated: a corrupted row fails loudly instead of executing.
    definition: parseRuleDefinition(type, row.definition),
    changeReason: row.changeReason,
    createdById: row.createdById,
    createdAt: row.createdAt,
  };
}

function currentVersionOf(row: RuleRow): RuleVersion {
  const current = row.versions[0];
  if (!current || current.version !== row.currentVersion) {
    throw new Error(`Rule ${row.id} is inconsistent: current version ${row.currentVersion} not found.`);
  }
  return current;
}

function toView(row: RuleRow): RuleView {
  return {
    id: row.id,
    type: row.type,
    targetSourceId: row.targetSourceId,
    status: row.status,
    currentVersion: row.currentVersion,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    current: toVersionView(row.type, currentVersionOf(row)),
  };
}

function toExecutable(type: RuleType, version: RuleVersion): ExecutableRule {
  return {
    ruleId: version.ruleId,
    ruleVersionId: version.id,
    version: version.version,
    name: version.name,
    type,
    executionOrder: version.executionOrder,
    definition: parseRuleDefinition(type, version.definition),
  };
}

@Injectable()
export class PrismaRulesRepository implements RulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: RuleFilter, page: PageRequest): Promise<Page<RuleView>> {
    const where: Prisma.RuleWhereInput = { status: filter.status, type: filter.type, targetSourceId: filter.targetSourceId };
    const [totalItems, rows] = await Promise.all([
      this.prisma.rule.count({ where }),
      this.prisma.rule.findMany({ where, include: RULE_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...toSkipTake(page) }),
    ]);
    return { items: rows.map(toView), page: page.page, pageSize: page.pageSize, totalItems };
  }

  async findById(id: string, tx?: TransactionContext): Promise<RuleView | null> {
    const row = await db(this.prisma, tx).rule.findUnique({ where: { id }, include: RULE_INCLUDE });
    return row ? toView(row) : null;
  }

  async listVersions(ruleId: string, page: PageRequest): Promise<Page<RuleVersionView>> {
    const rule = await this.prisma.rule.findUnique({ where: { id: ruleId }, select: { type: true } });
    if (!rule) return { items: [], page: page.page, pageSize: page.pageSize, totalItems: 0 };
    const [totalItems, rows] = await Promise.all([
      this.prisma.ruleVersion.count({ where: { ruleId } }),
      this.prisma.ruleVersion.findMany({ where: { ruleId }, orderBy: { version: 'desc' }, ...toSkipTake(page) }),
    ]);
    return { items: rows.map((row) => toVersionView(rule.type, row)), page: page.page, pageSize: page.pageSize, totalItems };
  }

  async findVersion(ruleId: string, version: number): Promise<RuleVersionView | null> {
    const row = await this.prisma.ruleVersion.findUnique({
      where: { ruleId_version: { ruleId, version } },
      include: { rule: { select: { type: true } } },
    });
    return row ? toVersionView(row.rule.type, row) : null;
  }

  async create(rule: NewRule, createdById: string, tx: TransactionContext): Promise<RuleView> {
    const row = await db(this.prisma, tx).rule.create({
      data: {
        type: rule.type,
        targetSourceId: rule.targetSourceId,
        status: 'INACTIVE',
        currentVersion: 1,
        createdById,
        versions: {
          create: {
            version: 1,
            name: rule.name,
            description: rule.description,
            phase: rule.phase,
            executionOrder: rule.executionOrder,
            definition: json(rule.definition),
            changeReason: rule.changeReason,
            createdById,
          },
        },
      },
      include: RULE_INCLUDE,
    });
    return toView(row);
  }

  async addVersion(
    ruleId: string,
    expectedVersion: number,
    content: RuleContent,
    changeReason: string,
    createdById: string,
    tx: TransactionContext,
  ): Promise<boolean> {
    const client = db(this.prisma, tx);
    const bumped = await client.rule.updateMany({
      where: { id: ruleId, currentVersion: expectedVersion },
      data: { currentVersion: expectedVersion + 1 },
    });
    if (bumped.count !== 1) return false;
    await client.ruleVersion.create({
      data: {
        ruleId,
        version: expectedVersion + 1,
        name: content.name,
        description: content.description,
        phase: content.phase,
        executionOrder: content.executionOrder,
        definition: json(content.definition),
        changeReason,
        createdById,
      },
    });
    return true;
  }

  async setStatus(ruleId: string, status: RuleStatus, tx: TransactionContext): Promise<void> {
    await db(this.prisma, tx).rule.update({ where: { id: ruleId }, data: { status }, select: { id: true } });
  }

  async listExecutable(sourceId: string, phase: string | null, tx?: TransactionContext): Promise<ExecutableRule[]> {
    const rows = await db(this.prisma, tx).rule.findMany({
      where: { targetSourceId: sourceId, status: 'ACTIVE' },
      include: RULE_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return rows
      .map((row) => ({ type: row.type, current: currentVersionOf(row) }))
      .filter(({ current }) => current.phase === null || current.phase === phase)
      .map(({ type, current }) => toExecutable(type, current));
  }

  async loadVersions(ruleVersionIds: readonly string[]): Promise<ExecutableRule[]> {
    if (ruleVersionIds.length === 0) return [];
    const rows = await this.prisma.ruleVersion.findMany({
      where: { id: { in: [...ruleVersionIds] } },
      include: { rule: { select: { type: true } } },
    });
    return rows.map((row) => toExecutable(row.rule.type, row));
  }
}
