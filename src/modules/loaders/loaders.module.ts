import { Module } from '@nestjs/common';
import { ExcelLoaderService } from './services/excel-loader.service';
import { SqlLoaderService } from './services/sql-loader.service';
import { SharepointLoaderService } from './services/sharepoint-loader.service';

@Module({
  providers: [ExcelLoaderService, SqlLoaderService, SharepointLoaderService],
  exports: [ExcelLoaderService, SqlLoaderService, SharepointLoaderService],
})
export class LoadersModule {}
