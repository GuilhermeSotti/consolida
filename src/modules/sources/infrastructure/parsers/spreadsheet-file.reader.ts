import { Injectable } from '@nestjs/common';
import type { FileFormat } from '../../domain/source';
import { TabularContent, TabularFileReader, TabularFormatError, TabularReadOptions } from '../../application/ports';
import { CsvDelimiter, CsvFormatError, parseCsv } from './csv.parser';
import { readXlsx } from './xlsx.reader';

@Injectable()
export class SpreadsheetFileReader implements TabularFileReader {
  read(content: Uint8Array, format: FileFormat, options: TabularReadOptions): TabularContent {
    if (format === 'XLSX') return readXlsx(content, options);
    try {
      const table = parseCsv(content, {
        delimiter: (options.delimiter ?? undefined) as CsvDelimiter | undefined,
        maxRows: options.maxRows,
        maxColumns: options.maxColumns,
      });
      return { header: table.header, rows: table.rows };
    } catch (error) {
      if (error instanceof CsvFormatError) throw new TabularFormatError(error.code, error.message, error.line);
      throw error;
    }
  }
}
