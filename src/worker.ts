// Dates read from spreadsheets are interpreted in UTC regardless of the host time zone.
process.env.TZ = 'UTC';

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { hostname } from 'node:os';
import { ConfigValidationError, loadAppConfig } from './config/app-config';
import { loadLocalEnvFile } from './config/env-file';
import { JsonLogger } from './shared/infrastructure/logging/json-logger';
import { startWorkerHealthServer } from './worker/worker-health';
import { JobRunner } from './worker/job-runner.service';
import { WorkerModule } from './worker/worker.module';

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  const config = loadAppConfig(process.env, { workerId: `${hostname()}-${process.pid}` });
  const logger = new JsonLogger(config.logLevel);
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), { logger });
  const runner = app.get(JobRunner);
  runner.start();
  const health = config.worker.healthPort === null ? null : await startWorkerHealthServer(config.worker.healthPort, runner.liveness);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.log({ event: 'worker_shutdown', signal }, 'Bootstrap');
    await runner.stop(config.worker.shutdownGraceMs);
    health?.close();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof ConfigValidationError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', context: 'Bootstrap', msg: message })}\n`);
  process.exit(1);
});
