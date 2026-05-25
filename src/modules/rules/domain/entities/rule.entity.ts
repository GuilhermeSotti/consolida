import { RuleStatus } from '../enums/rule-status.enum';

export class RuleEntity {
  id: string;

  name: string;

  description?: string;

  version: number;

  status: RuleStatus;

  sourceIds: string[];

  conditions: Record<string, unknown>;

  actions: Record<string, unknown>;

  priority: number;

  createdBy: string;

  updatedBy?: string;

  createdAt: Date;

  updatedAt: Date;

  deactivate() {
    this.status = RuleStatus.INACTIVE;
    this.updatedAt = new Date();
  }

  incrementVersion() {
    this.version += 1;
    this.updatedAt = new Date();
  }
}
