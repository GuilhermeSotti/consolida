import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/app-config';
import { API_PREFIX } from './shared/presentation/http/api-prefix';
import { ApiExceptionFilter } from './shared/presentation/http/api-exception.filter';
import { requestContextMiddleware } from './shared/presentation/http/request-context.middleware';
import { ResponseEnvelopeInterceptor } from './shared/presentation/http/response-envelope.interceptor';

/**
 * HTTP hardening and cross-cutting behaviour, shared by main.ts and the e2e tests so that the
 * tested application is configured exactly like the deployed one.
 */
export function configureHttpApplication(app: NestExpressApplication, config: AppConfig, logger: LoggerService): void {
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  // Plain key=value query strings only (no nested objects from qs).
  app.set('query parser', 'simple');
  app.use(requestContextMiddleware(logger));
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: config.nodeEnv === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.enableCors({
    origin: config.corsAllowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition', 'Idempotent-Replayed', 'Location'],
    credentials: false,
    maxAge: 600,
  });
  app.use(json({ limit: '1mb' }));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ApiExceptionFilter(logger));
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
}
