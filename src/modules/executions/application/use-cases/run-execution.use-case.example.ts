import { Injectable } from '@nestjs/common';
import { TelemetryService } from '../../../observability/telemetry.service';
import { AuditService } from '../../../audit/audit.service';
import { StructuredLoggerService } from '../../../observability/structured-logger.service';

/**
 * Exemplo de Run Execution Use Case com telemetria e auditoria
 */
@Injectable()
export class RunExecutionUseCaseExample {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly audit: AuditService,
    private readonly logger: StructuredLoggerService,
  ) {}

  /**
   * Exemplo de execução de regra com telemetria
   */
  async execute(input: { ruleId: string; sourceId: string }) {
    return await this.telemetry.withSpan(
      'executions.run',
      { module: 'executions', action: 'run' },
      async () => {
        this.logger.log('Starting execution', {
          ruleId: input.ruleId,
          sourceId: input.sourceId,
        });

        const startTime = Date.now();

        try {
          // Simulated execution
          const execution = {
            id: 'execution-123',
            ruleId: input.ruleId,
            sourceId: input.sourceId,
            status: 'COMPLETED',
            result: { recordsProcessed: 1000 },
            completedAt: new Date(),
          };

          const durationMs = Date.now() - startTime;

          // Record successful execution
          await this.audit.record({
            action: 'executions.run',
            entity: 'execution',
            entityId: execution.id,
            status: 'SUCCESS',
            durationMs,
            metadata: {
              ruleId: execution.ruleId,
              sourceId: execution.sourceId,
              recordsProcessed: execution.result.recordsProcessed,
            },
          });

          this.logger.log('Execution completed', {
            executionId: execution.id,
            durationMs,
            status: execution.status,
          });

          return execution;
        } catch (error) {
          const durationMs = Date.now() - startTime;

          await this.audit.record({
            action: 'executions.run',
            entity: 'execution',
            status: 'FAILURE',
            durationMs,
            metadata: {
              ruleId: input.ruleId,
              sourceId: input.sourceId,
              reason: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          this.logger.error('Execution failed', error instanceof Error ? error.stack : 'Unknown error', {
            ruleId: input.ruleId,
            sourceId: input.sourceId,
            durationMs,
          });

          throw error;
        }
      },
    );
  }
}
