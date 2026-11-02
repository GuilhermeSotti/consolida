import type { NewRule, RuleContent, RuleFilter, RulesRepository, RuleStatus, RuleVersionView, RuleView } from '../../src/modules/rules/application/ports';
import type { ExecutableRule, RuleType } from '../../src/modules/rules/domain/rule-definition';
import type { Page, PageRequest } from '../../src/shared/domain/pagination';
import { uuid } from './fakes';

let sequence = 500;

interface StoredRule {
  id: string;
  type: RuleType;
  targetSourceId: string;
  status: RuleStatus;
  createdById: string;
  versions: RuleVersionView[];
}

export class InMemoryRules implements RulesRepository {
  readonly rules = new Map<string, StoredRule>();
  /** Simulates another writer winning the optimistic-concurrency race. */
  loseNextRace = false;

  private view(rule: StoredRule): RuleView {
    const current = rule.versions[rule.versions.length - 1];
    return {
      id: rule.id,
      type: rule.type,
      targetSourceId: rule.targetSourceId,
      status: rule.status,
      currentVersion: current.version,
      createdById: rule.createdById,
      createdAt: rule.versions[0].createdAt,
      updatedAt: current.createdAt,
      current,
    };
  }

  seed(type: RuleType, targetSourceId: string, content: RuleContent, status: RuleStatus = 'ACTIVE'): RuleView {
    const id = uuid(sequence++);
    this.rules.set(id, {
      id,
      type,
      targetSourceId,
      status,
      createdById: uuid(900),
      versions: [{ ...content, id: uuid(sequence++), ruleId: id, version: 1, changeReason: null, createdById: uuid(900), createdAt: new Date() }],
    });
    return this.view(this.rules.get(id)!);
  }

  async list(_filter: RuleFilter, page: PageRequest): Promise<Page<RuleView>> {
    const items = [...this.rules.values()].map((rule) => this.view(rule));
    return { items, page: page.page, pageSize: page.pageSize, totalItems: items.length };
  }
  async findById(id: string): Promise<RuleView | null> {
    const rule = this.rules.get(id);
    return rule ? this.view(rule) : null;
  }
  async listVersions(ruleId: string, page: PageRequest): Promise<Page<RuleVersionView>> {
    const items = [...(this.rules.get(ruleId)?.versions ?? [])].reverse();
    return { items, page: page.page, pageSize: page.pageSize, totalItems: items.length };
  }
  async findVersion(ruleId: string, version: number): Promise<RuleVersionView | null> {
    return this.rules.get(ruleId)?.versions.find((item) => item.version === version) ?? null;
  }
  async create(rule: NewRule, createdById: string): Promise<RuleView> {
    const { type, targetSourceId, changeReason, ...content } = rule;
    const id = uuid(sequence++);
    this.rules.set(id, {
      id,
      type,
      targetSourceId,
      status: 'INACTIVE',
      createdById,
      versions: [{ ...content, id: uuid(sequence++), ruleId: id, version: 1, changeReason, createdById, createdAt: new Date() }],
    });
    return this.view(this.rules.get(id)!);
  }
  async addVersion(ruleId: string, expectedVersion: number, content: RuleContent, changeReason: string, createdById: string): Promise<boolean> {
    const rule = this.rules.get(ruleId)!;
    if (this.loseNextRace) {
      this.loseNextRace = false;
      rule.versions.push({ ...rule.versions[rule.versions.length - 1], id: uuid(sequence++), version: expectedVersion + 1 });
      return false;
    }
    if (rule.versions[rule.versions.length - 1].version !== expectedVersion) return false;
    rule.versions.push({ ...content, id: uuid(sequence++), ruleId, version: expectedVersion + 1, changeReason, createdById, createdAt: new Date() });
    return true;
  }
  async setStatus(ruleId: string, status: RuleStatus): Promise<void> {
    this.rules.get(ruleId)!.status = status;
  }
  async listExecutable(sourceId: string, phase: string | null): Promise<ExecutableRule[]> {
    return [...this.rules.values()]
      .filter((rule) => rule.targetSourceId === sourceId && rule.status === 'ACTIVE')
      .map((rule) => ({ rule, current: rule.versions[rule.versions.length - 1] }))
      .filter(({ current }) => current.phase === null || current.phase === phase)
      .map(({ rule, current }) => toExecutable(rule.type, current));
  }
  async loadVersions(ids: readonly string[]): Promise<ExecutableRule[]> {
    const all = [...this.rules.values()].flatMap((rule) => rule.versions.map((version) => toExecutable(rule.type, version)));
    return all.filter((rule) => ids.includes(rule.ruleVersionId));
  }
}

function toExecutable(type: RuleType, version: RuleVersionView): ExecutableRule {
  return {
    ruleId: version.ruleId,
    ruleVersionId: version.id,
    version: version.version,
    name: version.name,
    type,
    executionOrder: version.executionOrder,
    definition: version.definition,
  };
}
