import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './common/controllers/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { RulesModule } from './modules/rules/rules.module';
import { SourcesModule } from './modules/sources/sources.module';
import { ExecutionsModule } from './modules/executions/executions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RequestContextService } from './observability/request-context.service';
import { RequestContextMiddleware } from './observability/request-context.middleware';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';
import { TelemetryService } from './observability/telemetry.service';
import { AuditService } from './audit/audit.service';
import { PrismaService } from './shared/infrastructure/prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 5,
      },
    ]),
    AuthModule,
    RulesModule,
    SourcesModule,
    ExecutionsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    RequestContextService,
    StructuredLoggerService,
    RequestLoggingInterceptor,
    TelemetryService,
    AuditService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [
    TelemetryService,
    AuditService,
    StructuredLoggerService,
    RequestContextService,
    PrismaService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
