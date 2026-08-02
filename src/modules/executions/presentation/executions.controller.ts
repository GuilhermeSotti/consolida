import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RunExecutionUseCase } from '../application/use-cases/run-execution.use-case';

class RunExecutionDto {
  configurationId!: string;
}

@ApiTags('Executions')
@ApiBearerAuth()
@Controller('executions')
export class ExecutionsController {
  constructor(private readonly runExecution: RunExecutionUseCase) {}

  @Post('run')
  @ApiOperation({ summary: 'Run consolidation execution for a configuration' })
  async run(@Body() dto: RunExecutionDto) {
    const userId = 'user-id-placeholder';
    return this.runExecution.execute({ configurationId: dto.configurationId, runBy: userId });
  }
}
