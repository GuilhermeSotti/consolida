import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/presentation/http/api-response';
import { parsePageQuery } from '../../../shared/validation/input';
import { PERMISSIONS, Principal } from '../../auth/domain/access-control';
import { CurrentPrincipal, RequirePermissions } from '../../auth/presentation/access.decorators';
import type { RuleVersionView, RuleView } from '../application/ports';
import { RulesService } from '../application/rules.service';
import { parseCreateRuleRequest, parseListRulesQuery, parseUpdateRuleRequest, parseVersionParam } from './rules.requests';

@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RULES_VIEW)
  async list(@Query() query: Record<string, unknown>): Promise<PaginatedResult<RuleView>> {
    const { filter, page } = parseListRulesQuery(query);
    return new PaginatedResult(await this.rules.list(filter, page));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RULES_CREATE)
  create(@CurrentPrincipal() actor: Principal, @Body() body: unknown): Promise<RuleView> {
    return this.rules.create(actor, parseCreateRuleRequest(body));
  }

  @Get(':ruleId')
  @RequirePermissions(PERMISSIONS.RULES_VIEW)
  get(@Param('ruleId', new ParseUUIDPipe()) ruleId: string): Promise<RuleView> {
    return this.rules.get(ruleId);
  }

  /** Creates version N+1; requires `expectedVersion` and `changeReason`. */
  @Patch(':ruleId')
  @RequirePermissions(PERMISSIONS.RULES_UPDATE)
  update(@CurrentPrincipal() actor: Principal, @Param('ruleId', new ParseUUIDPipe()) ruleId: string, @Body() body: unknown): Promise<RuleView> {
    return this.rules.update(actor, ruleId, parseUpdateRuleRequest(body));
  }

  @Get(':ruleId/versions')
  @RequirePermissions(PERMISSIONS.RULES_VIEW)
  async versions(@Param('ruleId', new ParseUUIDPipe()) ruleId: string, @Query() query: Record<string, unknown>): Promise<PaginatedResult<RuleVersionView>> {
    return new PaginatedResult(await this.rules.listVersions(ruleId, parsePageQuery(query)));
  }

  @Get(':ruleId/versions/:version')
  @RequirePermissions(PERMISSIONS.RULES_VIEW)
  version(@Param('ruleId', new ParseUUIDPipe()) ruleId: string, @Param('version') version: string): Promise<RuleVersionView> {
    return this.rules.getVersion(ruleId, parseVersionParam(version));
  }

  @Post(':ruleId/activate')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.RULES_ACTIVATE)
  activate(@Param('ruleId', new ParseUUIDPipe()) ruleId: string): Promise<RuleView> {
    return this.rules.setStatus(ruleId, 'ACTIVE');
  }

  @Post(':ruleId/deactivate')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.RULES_ACTIVATE)
  deactivate(@Param('ruleId', new ParseUUIDPipe()) ruleId: string): Promise<RuleView> {
    return this.rules.setStatus(ruleId, 'INACTIVE');
  }
}
