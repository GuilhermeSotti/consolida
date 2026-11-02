import { CsvFormatError, decodeText, parseCsv } from '../../../src/modules/sources/infrastructure/parsers/csv.parser';

const utf8 = (text: string) => new TextEncoder().encode(text);

describe('parseCsv', () => {
  it('auto-detects the semicolon delimiter used by pt-BR Excel exports', () => {
    const table = parseCsv(utf8('NF;Valor;Fornecedor\r\n001;10,50;ACME\r\n002;7;"Xpto; Ltda"\r\n'), { maxRows: 10 });
    expect(table.delimiter).toBe(';');
    expect(table.header).toEqual(['NF', 'Valor', 'Fornecedor']);
    expect(table.rows).toEqual([
      ['001', '10,50', 'ACME'],
      ['002', '7', 'Xpto; Ltda'],
    ]);
  });

  it('handles quotes, escaped quotes, embedded line breaks and missing final newline', () => {
    const table = parseCsv(utf8('a,b\n"linha\num","diz ""oi"""\n3,4'), { maxRows: 10 });
    expect(table.rows).toEqual([
      ['linha\num', 'diz "oi"'],
      ['3', '4'],
    ]);
  });

  it('honours an explicit delimiter and skips blank lines', () => {
    const table = parseCsv(utf8('a\tb\n\n1\t2\n\t\n'), { delimiter: '\t', maxRows: 10 });
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('removes the UTF-8 BOM and falls back to Windows-1252', () => {
    expect(decodeText(utf8('﻿Código')).text).toBe('Código');
    const latin1 = Uint8Array.from([0x43, 0xf3, 0x64, 0x69, 0x67, 0x6f]); // "Código" in Windows-1252
    expect(decodeText(latin1)).toEqual({ text: 'Código', encoding: 'windows-1252' });
  });

  it.each([
    ['', 'EMPTY_FILE'],
    ['a,b\n"aberto,2\n', 'UNTERMINATED_QUOTE'],
  ])('reports format errors (%#)', (content, code) => {
    try {
      parseCsv(utf8(content), { maxRows: 10 });
      throw new Error('should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(CsvFormatError);
      expect((error as CsvFormatError).code).toBe(code);
    }
  });

  it('enforces row, column and field limits', () => {
    expect(() => parseCsv(utf8('a\n1\n2\n3\n'), { maxRows: 2 })).toThrow(CsvFormatError);
    expect(() => parseCsv(utf8('a,b,c\n'), { maxRows: 2, maxColumns: 2 })).toThrow('colunas');
    expect(() => parseCsv(utf8(`a\n${'x'.repeat(50)}\n`), { maxRows: 2, maxFieldLength: 10 })).toThrow('Campo');
  });
});

describe('delimiter detection', () => {
  it.each([
    ['a;b;c\n1;2;3', ';'],
    ['a,b,c\n1,2,3', ','],
    ['a\tb\n1\t2', '\t'],
    ['a|b|c\n1|2|3', '|'],
    ['"x;y",b,c\n1,2,3', ','],
    ['single\nvalue', ','],
  ])('detects the delimiter of %j', (text, delimiter) => {
    expect(parseCsv(new TextEncoder().encode(text), { maxRows: 10 }).delimiter).toBe(delimiter);
  });
});
