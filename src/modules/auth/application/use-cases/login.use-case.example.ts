import { Injectable } from '@nestjs/common';
import { TelemetryService } from '../../../observability/telemetry.service';
import { AuditService } from '../../../audit/audit.service';
import { StructuredLoggerService } from '../../../observability/structured-logger.service';

/**
 * Exemplo de Login Use Case com telemetria e auditoria
 * Este arquivo demonstra como integrar observabilidade em um use case
 */
@Injectable()
export class LoginUseCaseExample {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly audit: AuditService,
    private readonly logger: StructuredLoggerService,
  ) {}

  /**
   * Exemplo de execução com telemetria e auditoria
   */
  async execute(email: string, password: string) {
    return await this.telemetry.withSpan(
      'auth.login',
      { module: 'auth', action: 'login' },
      async () => {
        this.logger.log('Login attempt', { email });

        try {
          // Simulated authentication
          const user = {
            id: 'user-123',
            email,
            displayName: 'Test User',
          };

          // Record successful login
          await this.audit.record({
            action: 'auth.login',
            entity: 'user',
            entityId: user.id,
            status: 'SUCCESS',
            metadata: {
              email: user.email,
              method: 'password',
            },
          });

          this.logger.log('Login successful', { userId: user.id, email });

          return {
            userId: user.id,
            email: user.email,
            token: 'jwt-token-here',
          };
        } catch (error) {
          await this.audit.record({
            action: 'auth.login',
            entity: 'user',
            status: 'FAILURE',
            metadata: {
              email,
              reason: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          this.logger.error('Login failed', error instanceof Error ? error.stack : 'Unknown error', {
            email,
          });

          throw error;
        }
      },
    );
  }
}
