import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { AppConfig } from './config/app-config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthenticationGuard } from './modules/auth/presentation/authentication.guard';
import { AuthorizationGuard } from './modules/auth/presentation/authorization.guard';
import { ExecutionsModule } from './modules/executions/executions.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RulesModule } from './modules/rules/rules.module';
import { SourcesModule } from './modules/sources/sources.module';
import { UsersModule } from './modules/users/users.module';
import { CoreModule } from './shared/infrastructure/core.module';

/** HTTP API process. */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(config),
        // In-memory counters per replica (see docs/arquitetura/seguranca.md for multi-replica limits).
        ThrottlerModule.forRoot([{ ttl: config.rateLimit.ttlSeconds * 1000, limit: config.rateLimit.limit }]),
        AuthModule,
        UsersModule,
        SourcesModule,
        RulesModule,
        ExecutionsModule,
        ReportsModule,
        NotificationsModule,
        AuditModule,
        HealthModule,
      ],
      // Global guards, in this order: rate limit → authentication → authorization (deny-by-default).
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: AuthorizationGuard },
      ],
    };
  }
}
