import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { API_PREFIX } from '../../../shared/presentation/http/api-prefix';
import { PaginatedResult } from '../../../shared/presentation/http/api-response';
import { parsePageQuery } from '../../../shared/validation/input';
import { PERMISSIONS, Principal } from '../../auth/domain/access-control';
import { CurrentPrincipal, RequirePermissions } from '../../auth/presentation/access.decorators';
import { ExecutionRequestResult, ExecutionsService } from '../application/executions.service';
import type { ExecutionLogView, ExecutionView } from '../application/ports';
import { parseIdempotencyKey, parseListExecutionsQuery, parseRequestExecutionBody } from './executions.requests';

function respond(response: Response, result: ExecutionRequestResult): ExecutionView {
  // 202 for a newly queued execution; 200 when an earlier request with the same key is replayed.
  response.status(result.replayed ? 200 : 202);
  if (result.replayed) response.setHeader('Idempotent-Replayed', 'true');
  response.setHeader('Location', `/${API_PREFIX}/executions/${result.execution.id}`);
  return result.execution;
}

@Controller('executions')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EXECUTIONS_VIEW)
  async list(@Query() query: Record<string, unknown>): Promise<PaginatedResult<ExecutionView>> {
    const { filter, page } = parseListExecutionsQuery(query);
    return new PaginatedResult(await this.executions.list(filter, page));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXECUTIONS_RUN)
  async request(
    @CurrentPrincipal() actor: Principal,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ExecutionView> {
    const result = await this.executions.request(actor, parseRequestExecutionBody(body), parseIdempotencyKey(idempotencyKey));
    return respond(response, result);
  }

  @Get(':executionId')
  @RequirePermissions(PERMISSIONS.EXECUTIONS_VIEW)
  get(@Param('executionId', new ParseUUIDPipe()) executionId: string): Promise<ExecutionView> {
    return this.executions.get(executionId);
  }

  @Get(':executionId/logs')
  @RequirePermissions(PERMISSIONS.EXECUTIONS_VIEW)
  async logs(@Param('executionId', new ParseUUIDPipe()) executionId: string, @Query() query: Record<string, unknown>): Promise<PaginatedResult<ExecutionLogView>> {
    return new PaginatedResult(await this.executions.logs(executionId, parsePageQuery(query)));
  }

  @Post(':executionId/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXECUTIONS_CANCEL)
  cancel(@Param('executionId', new ParseUUIDPipe()) executionId: string): Promise<ExecutionView> {
    return this.executions.cancel(executionId);
  }

  @Post(':executionId/rerun')
  @RequirePermissions(PERMISSIONS.EXECUTIONS_RUN)
  async rerun(
    @CurrentPrincipal() actor: Principal,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ExecutionView> {
    const result = await this.executions.rerun(actor, executionId, parseIdempotencyKey(idempotencyKey));
    return respond(response, result);
  }
}
