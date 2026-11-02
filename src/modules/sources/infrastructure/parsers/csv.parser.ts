/**
 * Dependency-free CSV reader (RFC 4180 + common spreadsheet exports):
 *  - delimiters `;`, `,`, TAB or `|` (auto-detected from the header when not configured);
 *  - quoted fields with `""` escapes, embedded delimiters and line breaks;
 *  - CRLF, LF or CR line endings; UTF-8 (with or without BOM) or Windows-1252 fallback;
 *  - hard limits on rows, columns and field size to protect the worker process.
 */
export type CsvDelimiter = ',' | ';' | '\t' | '|';

export interface CsvParseOptions {
  delimiter?: CsvDelimiter;
  maxRows: number;
  maxColumns?: number;
  maxFieldLength?: number;
}

export interface CsvTable {
  header: string[];
  rows: string[][];
  delimiter: string;
  encoding: 'utf-8' | 'windows-1252';
}

export class CsvFormatError extends Error {
  constructor(
    readonly code: 'EMPTY_FILE' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS' | 'FIELD_TOO_LONG' | 'UNTERMINATED_QUOTE',
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

export function decodeText(content: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
    return { text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(content), encoding: 'windows-1252' };
  }
}

function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ';': 0, ',': 0, '\t': 0, '|': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === '\n' || char === '\r')) break;
    else if (!inQuotes && (char === ';' || char === ',' || char === '\t' || char === '|')) counts[char] += 1;
  }
  // Ties favour ";" (pt-BR Excel default), then TAB, then "|", then ",".
  const ranked: CsvDelimiter[] = [';', '\t', '|', ','];
  const best = ranked.reduce((winner, candidate) => (counts[candidate] > counts[winner] ? candidate : winner), ranked[0]);
  return counts[best] > 0 ? best : ',';
}

export function parseCsv(content: Uint8Array, options: CsvParseOptions): CsvTable {
  const { text, encoding } = decodeText(content);
  if (text.trim() === '') throw new CsvFormatError('EMPTY_FILE', 'Arquivo vazio.');
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const maxColumns = options.maxColumns ?? 500;
  const maxField = options.maxFieldLength ?? 32 * 1024;

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let fieldStarted = false;

  const pushField = () => {
    if (field.length > maxField) throw new CsvFormatError('FIELD_TOO_LONG', `Campo maior que ${maxField} caracteres.`, line);
    record.push(field);
    if (record.length > maxColumns) throw new CsvFormatError('TOO_MANY_COLUMNS', `Mais de ${maxColumns} colunas.`, line);
    field = '';
    fieldStarted = false;
  };
  const pushRecord = () => {
    pushField();
    const empty = record.every((value) => value.trim() === '');
    if (!empty) {
      records.push(record);
      // header + data rows
      if (records.length - 1 > options.maxRows) {
        throw new CsvFormatError('TOO_MANY_ROWS', `Mais de ${options.maxRows} linhas de dados.`, line);
      }
    }
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && !fieldStarted && field === '') {
      inQuotes = true;
      fieldStarted = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      pushRecord();
      line += 1;
    } else {
      field += char;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new CsvFormatError('UNTERMINATED_QUOTE', 'Aspas sem fechamento.', line);
  if (field !== '' || record.length > 0) pushRecord();
  if (records.length === 0) throw new CsvFormatError('EMPTY_FILE', 'Arquivo sem cabeçalho.');
  const [header, ...rows] = records;
  return { header, rows, delimiter, encoding };
}
