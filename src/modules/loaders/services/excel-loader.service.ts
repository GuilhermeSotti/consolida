import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

/**
 * Excel loader implementation using `xlsx` (reads buffer or filesystem path)
 */
@Injectable()
export class ExcelLoaderService {
  async load(bufferOrPath: Buffer | string, options?: { sheetName?: string }): Promise<any[]> {
    let workbook: XLSX.WorkBook;

    if (Buffer.isBuffer(bufferOrPath)) {
      workbook = XLSX.read(bufferOrPath, { type: 'buffer' });
    } else if (typeof bufferOrPath === 'string') {
      workbook = XLSX.readFile(bufferOrPath);
    } else {
      throw new Error('Invalid input for ExcelLoaderService.load');
    }

    const sheetName = options?.sheetName ?? workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];

    const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
    return json as any[];
  }
}
