import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@SkipThrottle()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - Indica se a aplicação está viva' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe - Indica se a aplicação está pronta para receber tráfego' })
  ready() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('startup')
  @ApiOperation({ summary: 'Startup probe - Indica se a aplicação completou o startup' })
  startup() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  @ApiOperation({ summary: 'Status geral da aplicação' })
  status() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
