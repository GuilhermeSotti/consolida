import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { AppConfig } from '../../../config/app-config';
import { TOKENS } from '../../../shared/application/ports';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { Public } from '../../auth/presentation/access.decorators';
import { CachedCheck } from '../application/cached-check';

/**
 * Probes for the orchestrator. They expose no version, configuration or dependency details.
 * Not throttled (probes must never be rejected); the database check is coalesced instead.
 */
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  private readonly database: CachedCheck;

  constructor(prisma: PrismaService, @Inject(TOKENS.APP_CONFIG) config: AppConfig) {
    this.database = new CachedCheck(() => prisma.$queryRaw`SELECT 1`, config.health.readyCacheMs);
  }

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    if (!(await this.database.check())) throw new ServiceUnavailableException();
    return { status: 'ok' };
  }
}
