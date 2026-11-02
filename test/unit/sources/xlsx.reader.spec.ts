import * as XLSX from 'xlsx';
import { TabularFormatError, type TabularReadOptions } from '../../../src/modules/sources/application/ports';
import { readXlsx } from '../../../src/modules/sources/infrastructure/parsers/xlsx.reader';

function opts(overrides: Partial<TabularReadOptions> = {}): TabularReadOptions {
  return { sheetName: null, delimiter: null, maxRows: 200_000, maxColumns: 500, ...overrides };
}

function workbook(rows: unknown[][], options: { ref?: string; sheet?: string } = {}): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (options.ref) sheet['!ref'] = options.ref;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, options.sheet ?? 'Dados');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof TabularFormatError) return error.code;
    throw error;
  }
  return 'OK';
}

describe('readXlsx', () => {
  it('reads only the columns that hold values even when the declared range reaches column XFD', () => {
    const content = workbook([['NF', 'VALOR'], ['1', 10], ['2', 20]], { ref: 'A1:XFD3' });
    expect(readXlsx(content, opts())).toEqual({ header: ['NF', 'VALOR'], rows: [['1', 10], ['2', 20]], sheetName: 'Dados' });
  });

  it('rejects data wider than the column limit before expanding the sheet', () => {
    const header: unknown[] = Array.from({ length: 6 }, (_, index) => `C${index}`);
    expect(code(() => readXlsx(workbook([header, [1]]), opts({ maxRows: 10, maxColumns: 5 })))).toBe('TOO_MANY_COLUMNS');
  });

  it('rejects sheets above the row limit, missing sheets and empty sheets', () => {
    const rows: unknown[][] = [['A'], ...Array.from({ length: 12 }, (_, index) => [index])];
    expect(code(() => readXlsx(workbook(rows), opts({ maxRows: 10, maxColumns: 5 })))).toBe('TOO_MANY_ROWS');
    expect(code(() => readXlsx(workbook([['A'], [1]]), opts({ sheetName: 'Outra' })))).toBe('SHEET_NOT_FOUND');
    expect(code(() => readXlsx(workbook([]), opts()))).toBe('EMPTY_FILE');
    expect(code(() => readXlsx(new TextEncoder().encode('não é xlsx'), opts()))).toBe('INVALID_XLSX');
  });

  it('handles sheets with more than 125 thousand rows (no argument spreading over rows)', () => {
    const rows: unknown[][] = [['ID'], ...Array.from({ length: 130_000 }, (_, index) => [index])];
    const result = readXlsx(workbook(rows), opts());
    expect(result.rows).toHaveLength(130_000);
    expect(result.rows[129_999]).toEqual([129_999]);
  });
});
