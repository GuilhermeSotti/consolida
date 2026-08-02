import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GetReportUseCase } from '../application/use-cases/get-report.use-case';
import { ListReportsUseCase } from '../application/use-cases/list-reports.use-case';

class QueryReportsDto {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly getReport: GetReportUseCase, private readonly listReports: ListReportsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List reports' })
  list(@Query() query: QueryReportsDto) {
    return this.listReports.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report by id' })
  get(@Param('id') id: string) {
    return this.getReport.execute(id);
  }
}
