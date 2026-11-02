import { csvHeader, csvLines, escapeCsvCell } from '../../../src/modules/reports/domain/csv-export';

describe('CSV export', () => {
  it('neutralizes spreadsheet formulas in text cells (CSV injection)', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvCell('-10')).toBe("'-10");
  });

  it('keeps numbers, booleans and null as plain values', () => {
    expect(escapeCsvCell(-10.5)).toBe('-10.5');
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell(null)).toBe('');
  });

  it('quotes delimiters, quotes, line breaks and surrounding spaces', () => {
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell('linha\n2')).toBe('"linha\n2"');
    expect(escapeCsvCell(' x ')).toBe('" x "');
    expect(escapeCsvCell('a,b', ',')).toBe('"a,b"');
  });

  it('quotes text with any common separator so other locales cannot split out a formula', () => {
    // A spreadsheet that splits on "," (en-US) would otherwise turn "=1+1" into its own cell.
    expect(escapeCsvCell('x,=1+1')).toBe('"x,=1+1"');
    expect(escapeCsvCell('x\t@cmd')).toBe('"x\t@cmd"');
    expect(escapeCsvCell('10,50')).toBe('"10,50"');
    expect(escapeCsvCell('sem separador')).toBe('sem separador');
  });

  it('writes header and rows with CRLF in column order', () => {
    expect(csvHeader(['NF', 'VALOR'])).toBe('NF;VALOR\r\n');
    expect(csvLines(['NF', 'VALOR'], [{ VALOR: 1, NF: '001' }, { NF: '002' }])).toBe('001;1\r\n002;\r\n');
  });
});
