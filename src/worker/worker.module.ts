import { DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { ExecutionRunner } from '../modules/executions/application/execution-runner';
import { ExecutionsCoreModule } from '../modules/executions/executions.module';
import { ImportProcessor } from '../modules/sources/application/import-processor';
import { SourcesCoreModule } from '../modules/sources/sources.module';
import { CoreModule } from '../shared/infrastructure/core.module';
import { createJobHandlers } from './job-handlers';
import { JOB_HANDLERS, JobRunner, WORKER_STATE, type WorkerState } from './job-runner.service';

/** Worker process: no HTTP server, consumes background jobs (imports and executions). */
@Module({})
export class WorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [CoreModule.forRoot(config), SourcesCoreModule, ExecutionsCoreModule],
      providers: [
        { provide: WORKER_STATE, useValue: { stopping: false } satisfies WorkerState },
        {
          provide: JOB_HANDLERS,
          useFactory: (imports: ImportProcessor, executions: ExecutionRunner, state: WorkerState) => createJobHandlers(imports, executions, state),
          inject: [ImportProcessor, ExecutionRunner, WORKER_STATE],
        },
        JobRunner,
      ],
    };
  }
}
