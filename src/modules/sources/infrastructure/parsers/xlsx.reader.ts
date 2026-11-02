import * as XLSX from 'xlsx';
import { TabularContent, TabularFormatError, TabularReadOptions } from '../../application/ports';
import { looksLike } from '../../domain/source';

/**
 * Reads one worksheet of an XLSX file with SheetJS CE 0.20.3 (the npm "xlsx" 0.18.x line has
 * unpatched CVE-2023-30533 and CVE-2024-22363). Formulas/HTML are not evaluated or kept: only
 * cached cell values are read. `sheetRows` bounds the rows parsed for oversized sheets, and the
 * width is measured from the cells that actually hold values BEFORE the sheet is expanded into a
 * matrix, so a declared range wider than the data (formatting up to column XFD) neither exhausts
 * memory nor rejects a valid file.
 */
export function readXlsx(content: Uint8Array, options: TabularReadOptions): TabularContent {
  // SheetJS auto-detects many formats (CSV, HTML, SYLK, legacy XLS...). Only ZIP-based XLSX is
  // accepted, so other parsers are never reached (defense in depth: the upload checks it too).
  if (!looksLike('XLSX', content)) {
    throw new TabularFormatError('INVALID_XLSX', 'Arquivo XLSX inválido, protegido por senha ou corrompido.');
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(content, {
      type: 'buffer',
      dense: true,
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellText: false,
      cellStyles: false,
      bookVBA: false,
      sheetRows: options.maxRows + 2,
    });
  } catch {
    throw new TabularFormatError('INVALID_XLSX', 'Arquivo XLSX inválido, protegido por senha ou corrompido.');
  }
  const sheetName = options.sheetName ?? workbook.SheetNames[0];
  const sheet = sheetName === undefined ? undefined : workbook.Sheets[sheetName];
  if (!sheet || sheetName === undefined) {
    throw new TabularFormatError('SHEET_NOT_FOUND', options.sheetName ? `A aba "${options.sheetName}" não existe no arquivo.` : 'O arquivo não possui abas.');
  }
  const declared = typeof sheet['!ref'] === 'string' ? XLSX.utils.decode_range(sheet['!ref']) : null;
  const lastColumn = declared ? lastUsedColumn(sheet) : -1;
  if (!declared || lastColumn < declared.s.c) throw new TabularFormatError('EMPTY_FILE', 'A aba está vazia.');
  if (lastColumn - declared.s.c + 1 > options.maxColumns) {
    throw new TabularFormatError('TOO_MANY_COLUMNS', `A aba excede o limite de ${options.maxColumns} colunas.`);
  }
  const range: XLSX.Range = { s: declared.s, e: { r: declared.e.r, c: Math.min(declared.e.c, lastColumn) } };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false, range });
  if (matrix.length === 0) throw new TabularFormatError('EMPTY_FILE', 'A aba está vazia.');
  if (matrix.length - 1 > options.maxRows) {
    throw new TabularFormatError('TOO_MANY_ROWS', `A aba excede o limite de ${options.maxRows} linhas.`);
  }
  const [header, ...rows] = matrix;
  return { header, rows, sheetName };
}

type CellLike = { v?: unknown } | null | undefined;

/**
 * Highest column index (absolute, 0-based) holding a value, or -1. Supports the dense layouts of
 * SheetJS 0.20 (`!data`) and 0.18 (array worksheet) and the sparse A1-keyed layout. Iterative:
 * no argument spreading over rows (which overflows the stack for large sheets).
 */
function lastUsedColumn(sheet: XLSX.WorkSheet): number {
  const record = sheet as unknown as Record<string, unknown>;
  const dense = Array.isArray(record['!data']) ? (record['!data'] as unknown[]) : Array.isArray(sheet) ? (sheet as unknown[]) : null;
  let last = -1;
  if (dense) {
    for (const row of dense) {
      if (!Array.isArray(row)) continue;
      for (let column = row.length - 1; column > last; column -= 1) {
        const cell = row[column] as CellLike;
        if (cell && cell.v !== undefined) {
          last = column;
          break;
        }
      }
    }
    return last;
  }
  for (const key of Object.keys(record)) {
    if (key.startsWith('!')) continue;
    const cell = record[key] as CellLike;
    if (cell && cell.v !== undefined) last = Math.max(last, XLSX.utils.decode_cell(key).c);
  }
  return last;
}
