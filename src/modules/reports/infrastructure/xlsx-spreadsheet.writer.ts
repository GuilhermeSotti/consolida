import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import type { Row } from '../../../shared/domain/tabular';
import type { SpreadsheetWriter } from '../application/ports';

/**
 * Writes the report as XLSX. Text cells are written as literal strings (type "s"); SheetJS never
 * turns a value starting with "=" into a formula unless a formula is set explicitly, so the
 * CSV-injection vector does not apply here.
 */
@Injectable()
export class XlsxSpreadsheetWriter implements SpreadsheetWriter {
  writeXlsx(sheetName: string, columns: readonly string[], rows: readonly Row[]): Uint8Array {
    const matrix: Array<Array<string | number | boolean | null>> = [[...columns]];
    for (const row of rows) matrix.push(columns.map((column) => row[column] ?? null));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), sheetName.slice(0, 31));
    const output: unknown = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
    if (!Buffer.isBuffer(output)) throw new Error('XLSX writer did not return a buffer.');
    return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
  }
}
