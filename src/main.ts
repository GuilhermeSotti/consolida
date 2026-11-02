import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigValidationError, loadAppConfig } from './config/app-config';
import { loadLocalEnvFile } from './config/env-file';
import { configureHttpApplication } from './http-app';
import { JsonLogger } from './shared/infrastructure/logging/json-logger';

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  const config = loadAppConfig(process.env);
  const logger = new JsonLogger(config.logLevel);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { logger, bodyParser: false });
  configureHttpApplication(app, config, logger);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  logger.log({ event: 'api_started', port: config.port, environment: config.nodeEnv }, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof ConfigValidationError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', context: 'Bootstrap', msg: message })}\n`);
  process.exit(1);
});
