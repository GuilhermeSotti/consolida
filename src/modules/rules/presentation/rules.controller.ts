import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
} from '@nestjs/swagger';

import { CreateRuleDto } from '../application/dto/create-rule.dto';
import { UpdateRuleDto } from '../application/dto/update-rule.dto';
import { QueryRulesDto } from '../application/dto/query-rules.dto';

import { CreateRuleUseCase } from '../application/use-cases/create-rule.use-case';
import { UpdateRuleUseCase } from '../application/use-cases/update-rule.use-case';
import { ListRulesUseCase } from '../application/use-cases/list-rules.use-case';
import { GetRuleUseCase } from '../application/use-cases/get-rule.use-case';
import { DeactivateRuleUseCase } from '../application/use-cases/deactivate-rule.use-case';
import { GetRuleVersionsUseCase } from '../application/use-cases/get-rule-versions.use-case';
import { ActivateRuleUseCase } from '../application/use-cases/activate-rule.use-case';

@ApiTags('Rules')
@ApiBearerAuth()
@Controller('rules')
export class RulesController {
  constructor(
    private readonly createRule: CreateRuleUseCase,
    private readonly updateRule: UpdateRuleUseCase,
    private readonly listRules: ListRulesUseCase,
    private readonly getRule: GetRuleUseCase,
    private readonly deactivateRule: DeactivateRuleUseCase,
    private readonly getRuleVersions: GetRuleVersionsUseCase,
    private readonly activateRule: ActivateRuleUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova regra' })
  @SwaggerApiResponse({
    status: HttpStatus.CREATED,
    description: 'Regra criada com sucesso',
  })
  create(@Body() dto: CreateRuleDto) {
    // TODO: Extract userId from request context
    const userId = 'user-id-placeholder';
    return this.createRule.execute(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar regras com filtros e paginação' })
  @SwaggerApiResponse({
    status: HttpStatus.OK,
    description: 'Lista retornada com sucesso',
  })
  findAll(@Query() query: QueryRulesDto) {
    return this.listRules.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma regra' })
  @SwaggerApiResponse({
    status: HttpStatus.OK,
    description: 'Regra retornada com sucesso',
  })
  @SwaggerApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Regra não encontrada',
  })
  findOne(@Param('id') id: string) {
    return this.getRule.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar regra' })
  @SwaggerApiResponse({
    status: HttpStatus.OK,
    description: 'Regra atualizada com sucesso',
  })
  update(@Param('id') id: string, @Body() dto: UpdateRuleDto) {
    // TODO: Extract userId from request context
    const userId = 'user-id-placeholder';
    return this.updateRule.execute(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar regra' })
  @SwaggerApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Regra deletada com sucesso',
  })
  deactivate(@Param('id') id: string) {
    return this.deactivateRule.execute(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Listar versões de uma regra' })
  @SwaggerApiResponse({
    status: HttpStatus.OK,
    description: 'Versões listadas com sucesso',
  })
  getVersions(@Param('id') id: string, @Query() query: QueryRulesDto) {
    return this.getRuleVersions.execute(id, query);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Ativar regra' })
  @SwaggerApiResponse({
    status: HttpStatus.OK,
    description: 'Regra ativada com sucesso',
  })
  activate(@Param('id') id: string) {
    return this.activateRule.execute(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Desativar regra' })
  @SwaggerApiResponse({
    status: HttpStatus.OK,
    description: 'Regra desativada com sucesso',
  })
  deactivateExplicit(@Param('id') id: string) {
    return this.deactivateRule.execute(id);
  }
}
