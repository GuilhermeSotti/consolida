import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Row } from '../../../shared/domain/tabular';
import { PaginatedResult } from '../../../shared/presentation/http/api-response';
import { parsePageQuery } from '../../../shared/validation/input';
import { PERMISSIONS, Principal } from '../../auth/domain/access-control';
import { CurrentPrincipal, RequirePermissions } from '../../auth/presentation/access.decorators';
import { ImportsService } from '../application/imports.service';
import type { ImportView, SourceView } from '../application/ports';
import { SourcesService } from '../application/sources.service';
import { parseCreateSourceRequest, parseListImportsQuery, parseListSourcesQuery, parseUpdateSourceRequest } from './sources.requests';

/** Multer file kept in memory (limits configured in SourcesModule). */
interface MemoryFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

@Controller('sources')
export class SourcesController {
  constructor(
    private readonly sources: SourcesService,
    private readonly imports: ImportsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SOURCES_VIEW)
  async list(@Query() query: Record<string, unknown>): Promise<PaginatedResult<SourceView>> {
    const { filter, page } = parseListSourcesQuery(query);
    return new PaginatedResult(await this.sources.list(filter, page));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SOURCES_CREATE)
  create(@CurrentPrincipal() actor: Principal, @Body() body: unknown): Promise<SourceView> {
    return this.sources.create(actor, parseCreateSourceRequest(body));
  }

  @Get(':sourceId')
  @RequirePermissions(PERMISSIONS.SOURCES_VIEW)
  get(@Param('sourceId', new ParseUUIDPipe()) sourceId: string): Promise<SourceView> {
    return this.sources.get(sourceId);
  }

  @Patch(':sourceId')
  @RequirePermissions(PERMISSIONS.SOURCES_UPDATE)
  update(@CurrentPrincipal() actor: Principal, @Param('sourceId', new ParseUUIDPipe()) sourceId: string, @Body() body: unknown): Promise<SourceView> {
    return this.sources.update(actor, sourceId, parseUpdateSourceRequest(body));
  }

  @Post(':sourceId/activate')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SOURCES_UPDATE)
  activate(@CurrentPrincipal() actor: Principal, @Param('sourceId', new ParseUUIDPipe()) sourceId: string): Promise<SourceView> {
    return this.sources.setStatus(actor, sourceId, 'ACTIVE');
  }

  @Post(':sourceId/deactivate')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SOURCES_UPDATE)
  deactivate(@CurrentPrincipal() actor: Principal, @Param('sourceId', new ParseUUIDPipe()) sourceId: string): Promise<SourceView> {
    return this.sources.setStatus(actor, sourceId, 'INACTIVE');
  }

  @Get(':sourceId/imports')
  @RequirePermissions(PERMISSIONS.SOURCES_VIEW)
  async listImports(@Param('sourceId', new ParseUUIDPipe()) sourceId: string, @Query() query: Record<string, unknown>): Promise<PaginatedResult<ImportView>> {
    const { status, page } = parseListImportsQuery(query);
    return new PaginatedResult(await this.imports.list(sourceId, status, page));
  }

  /** multipart/form-data with a single part named "file". Validation runs asynchronously (202). */
  @Post(':sourceId/imports')
  @HttpCode(202)
  @RequirePermissions(PERMISSIONS.SOURCES_IMPORT)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentPrincipal() actor: Principal,
    @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
    @UploadedFile() file: MemoryFile | undefined,
  ): Promise<ImportView> {
    return this.imports.upload(
      actor,
      sourceId,
      file ? { originalName: file.originalname, size: file.size, content: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength) } : undefined,
    );
  }
}

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get(':importId')
  @RequirePermissions(PERMISSIONS.SOURCES_VIEW)
  get(@Param('importId', new ParseUUIDPipe()) importId: string): Promise<ImportView> {
    return this.imports.get(importId);
  }

  @Get(':importId/rows')
  @RequirePermissions(PERMISSIONS.SOURCES_VIEW)
  async rows(@Param('importId', new ParseUUIDPipe()) importId: string, @Query() query: Record<string, unknown>): Promise<PaginatedResult<Row>> {
    return new PaginatedResult(await this.imports.rows(importId, parsePageQuery(query)));
  }
}
