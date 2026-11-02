import {
  BLANK_TOKEN,
  cleanText,
  compare,
  isBlank,
  normalize,
  normalizeKeyValue,
  parseNumber,
  toText,
} from '../../../src/modules/rules/domain/engine/values';

describe('engine values', () => {
  describe('parseNumber', () => {
    it.each([
      [10, 10],
      ['42', 42],
      ['-7', -7],
      ['1234.5', 1234.5],
      ['1234,5', 1234.5],
      ['1.234.567,89', 1234567.89],
      ['1,234,567.89', 1234567.89],
      [' 12 ', 12],
      [' 12', 12],
    ])('reads %p as %p', (input, expected) => {
      expect(parseNumber(input as string | number)).toBe(expected);
    });

    it.each([['abc'], [''], ['1e5'], ['12a'], [null], [true]])('returns null for %p', (input) => {
      expect(parseNumber(input as string | null | boolean)).toBeNull();
    });
  });

  describe('normalize (port of M "Modo")', () => {
    it('applies the modes in order', () => {
      expect(normalize('  AbC-12 ', ['TRIM', 'LOWERCASE'])).toBe('abc-12');
      expect(normalize('A-b c.9', ['REMOVE_SPECIAL_CHARACTERS'])).toBe('Abc9');
      expect(normalize('Rua 10, nº 5', ['TEXT_ONLY'])).toBe('Rua 10 n 5');
      expect(normalize('CNPJ 12.345/0001', ['DIGITS_ONLY'])).toBe('123450001');
      expect(normalize('abcd', ['LENGTH'])).toBe(4);
      expect(normalize(12.5, ['UPPERCASE'])).toBe('12.5');
    });

    it('keeps null and ignores DEFAULT', () => {
      expect(normalize(null, ['TRIM', 'LENGTH'])).toBeNull();
      expect(normalize('x', ['DEFAULT'])).toBe('x');
    });
  });

  describe('compare (port of M "Operador")', () => {
    it('compares numerically when both sides are numeric (AUTO)', () => {
      expect(compare('100', 'GREATER_THAN', '20', 'AUTO')).toBe(true);
      expect(compare(1000, 'EQUALS', '1.000,00', 'AUTO')).toBe(true);
    });

    it('compares as text when requested', () => {
      expect(compare('100', 'GREATER_THAN', '20', 'TEXT')).toBe(false);
      expect(compare('b', 'GREATER_THAN', 'a', 'AUTO')).toBe(true);
    });

    it('NUMBER mode never matches non numeric values except NOT_EQUALS', () => {
      expect(compare('abc', 'EQUALS', 'abc', 'NUMBER')).toBe(false);
      expect(compare('abc', 'NOT_EQUALS', 'abc', 'NUMBER')).toBe(true);
    });

    it('handles text operators with null as empty text', () => {
      expect(compare('Fornecedor ACME', 'CONTAINS', 'ACME', 'AUTO')).toBe(true);
      expect(compare('Fornecedor ACME', 'NOT_CONTAINS', 'XPTO', 'AUTO')).toBe(true);
      expect(compare('NF-001', 'STARTS_WITH', 'NF', 'AUTO')).toBe(true);
      expect(compare('NF-001', 'ENDS_WITH', '001', 'AUTO')).toBe(true);
      expect(compare(null, 'CONTAINS', '', 'AUTO')).toBe(true);
    });

    it('treats null only as equal to null', () => {
      expect(compare(null, 'EQUALS', null, 'AUTO')).toBe(true);
      expect(compare(null, 'EQUALS', 'x', 'AUTO')).toBe(false);
      expect(compare('x', 'NOT_EQUALS', null, 'AUTO')).toBe(true);
      expect(compare(null, 'GREATER_THAN', 1, 'AUTO')).toBe(false);
    });
  });

  describe('normalizeKeyValue (port of normalizarValor)', () => {
    it('uses the blank token for empty values', () => {
      expect(normalizeKeyValue(null)).toBe(BLANK_TOKEN);
      expect(normalizeKeyValue('   ')).toBe(BLANK_TOKEN);
    });

    it('canonicalizes numbers and text keys', () => {
      expect(normalizeKeyValue('00123')).toBe('123');
      expect(normalizeKeyValue(123)).toBe('123');
      expect(normalizeKeyValue('Cód. A 1')).toBe('códa1');
    });
  });

  it('cleanText folds accents and optionally removes special characters', () => {
    expect(cleanText('AÇÃO Única!', false)).toBe('acao unica!');
    expect(cleanText('AÇÃO Única!', true)).toBe('acao unica');
  });

  it('isBlank/toText follow the original semantics', () => {
    expect(isBlank(0)).toBe(false);
    expect(isBlank(' ')).toBe(true);
    expect(toText(false)).toBe('false');
    expect(toText(null)).toBe('');
  });
});
