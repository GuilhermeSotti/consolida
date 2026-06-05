import { Injectable } from '@nestjs/common';
import { TelemetryService } from '../../../observability/telemetry.service';
import { AuditService } from '../../../audit/audit.service';
import { StructuredLoggerService } from '../../../observability/structured-logger.service';

/**
 * Exemplo de Create Rule Use Case com telemetria e auditoria
 */
@Injectable()
export class CreateRuleUseCaseExample {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly audit: AuditService,
    private readonly logger: StructuredLoggerService,
  ) {}

  /**
   * Exemplo de criação de regra com telemetria
   */
  async execute(input: { name: string; description: string }) {
    return await this.telemetry.withSpan(
      'rules.create',
      { module: 'rules', action: 'create' },
      async () => {
        this.logger.log('Creating rule', { ruleName: input.name });

        try {
          // Simulated rule creation
          const rule = {
            id: 'rule-123',
            name: input.name,
            description: input.description,
            version: 1,
            status: 'ACTIVE',
            createdAt: new Date(),
          };

          // Record successful creation
          await this.audit.record({
            action: 'rules.create',
            entity: 'rule',
            entityId: rule.id,
            status: 'SUCCESS',
            metadata: {
              ruleName: rule.name,
              version: rule.version,
              status: rule.status,
            },
          });

          this.logger.log('Rule created successfully', {
            ruleId: rule.id,
            ruleName: rule.name,
          });

          return rule;
        } catch (error) {
          await this.audit.record({
            action: 'rules.create',
            entity: 'rule',
            status: 'FAILURE',
            metadata: {
              ruleName: input.name,
              reason: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          this.logger.error('Failed to create rule', error instanceof Error ? error.stack : 'Unknown error', {
            ruleName: input.name,
          });

          throw error;
        }
      },
    );
  }
}
