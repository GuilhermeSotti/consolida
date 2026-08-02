import { Body, Controller, Get, Param, Patch, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';

import { CreateSourceDto } from '../application/dto/create-source.dto';
import { UpdateSourceDto } from '../application/dto/update-source.dto';
import { QuerySourcesDto } from '../application/dto/query-sources.dto';

import { CreateSourceUseCase } from '../application/use-cases/create-source.use-case';
import { UpdateSourceUseCase } from '../application/use-cases/update-source.use-case';
import { ListSourcesUseCase } from '../application/use-cases/list-sources.use-case';
import { GetSourceUseCase } from '../application/use-cases/get-source.use-case';
import { DeactivateSourceUseCase } from '../application/use-cases/deactivate-source.use-case';

@ApiTags('Sources')
@ApiBearerAuth()
@Controller('sources')
export class SourcesController {
  constructor(
    private readonly createSource: CreateSourceUseCase,
    private readonly updateSource: UpdateSourceUseCase,
    private readonly listSources: ListSourcesUseCase,
    private readonly getSource: GetSourceUseCase,
    private readonly deactivateSource: DeactivateSourceUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova fonte' })
  @SwaggerApiResponse({ status: HttpStatus.CREATED, description: 'Fonte criada' })
  create(@Body() dto: CreateSourceDto) {
    const userId = 'user-id-placeholder';
    return this.createSource.execute(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar fontes' })
  @SwaggerApiResponse({ status: HttpStatus.OK, description: 'Lista retornada' })
  findAll(@Query() query: QuerySourcesDto) {
    return this.listSources.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter fonte por id' })
  findOne(@Param('id') id: string) {
    return this.getSource.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar fonte' })
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    const userId = 'user-id-placeholder';
    return this.updateSource.execute(id, dto, userId);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar fonte' })
  deactivate(@Param('id') id: string) {
    return this.deactivateSource.execute(id);
  }
}
