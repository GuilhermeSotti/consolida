import { ValidationError } from '../../../src/shared/domain/errors';
import { isRuleType, parseRuleDefinition } from '../../../src/modules/rules/domain/rule-definition.parser';

const SOURCE_ID = '7d0c3a8e-4a5b-4c1d-9e2f-0a1b2c3d4e5f';

function issuesOf(fn: () => unknown): Array<{ field?: string; message: string }> {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.details;
    throw error;
  }
  throw new Error('expected ValidationError');
}

describe('parseRuleDefinition', () => {
  it('canonicalizes column names and fills defaults for FILTER', () => {
    const definition = parseRuleDefinition('FILTER', {
      condition: { column: ' valor total ', operator: 'GREATER_THAN', values: [0] },
    });
    expect(definition).toEqual({
      condition: { column: 'VALOR_TOTAL', operator: 'GREATER_THAN', values: [0], normalization: [], compareAs: 'AUTO' },
    });
  });

  it('rejects unknown properties and invalid enums with field paths', () => {
    const issues = issuesOf(() =>
      parseRuleDefinition('FILTER', {
        condition: { column: 'A', operator: 'LIKE', values: ['x'], extra: true },
      }),
    );
    expect(issues).toContainEqual({ field: 'condition.extra', message: 'propriedade não permitida' });
    expect(issues.some((i) => i.field === 'condition.operator')).toBe(true);
  });

  it('accepts null only for equality operators', () => {
    expect(() =>
      parseRuleDefinition('FILTER', { condition: { column: 'A', operator: 'EQUALS', values: [null] } }),
    ).not.toThrow();
    const issues = issuesOf(() =>
      parseRuleDefinition('FILTER', { condition: { column: 'A', operator: 'CONTAINS', values: [null] } }),
    );
    expect(issues[0].field).toBe('condition.values');
  });

  it('validates CONDITIONAL_ASSIGNMENT literal and column values', () => {
    const literal = parseRuleDefinition('CONDITIONAL_ASSIGNMENT', {
      condition: { column: 'status', operator: 'EQUALS', values: ['P'], normalization: ['UPPERCASE'] },
      targetColumn: 'situação',
      value: { kind: 'LITERAL', value: 'PENDENTE' },
    });
    expect(literal.targetColumn).toBe('SITUAÇÃO');
    const fromColumn = parseRuleDefinition('CONDITIONAL_ASSIGNMENT', {
      condition: { column: 'status', operator: 'EQUALS', values: ['P'] },
      targetColumn: 'destino',
      value: { kind: 'COLUMN', column: 'valor original' },
    });
    expect(fromColumn.value).toEqual({ kind: 'COLUMN', column: 'VALOR_ORIGINAL' });
    expect(() =>
      parseRuleDefinition('CONDITIONAL_ASSIGNMENT', {
        condition: { column: 'status', operator: 'EQUALS', values: ['P'] },
        targetColumn: 'destino',
        value: { kind: 'COLUMN' },
      }),
    ).toThrow(ValidationError);
  });

  it('requires one arithmetic operation between each pair of operands', () => {
    expect(
      parseRuleDefinition('ARITHMETIC', { operands: ['a', 'b', 'c'], operations: ['ADD', 'MULTIPLY'], targetColumn: 'total' }),
    ).toEqual({ operands: ['A', 'B', 'C'], operations: ['ADD', 'MULTIPLY'], targetColumn: 'TOTAL' });
    const issues = issuesOf(() =>
      parseRuleDefinition('ARITHMETIC', { operands: ['a', 'b'], operations: [], targetColumn: 'total' }),
    );
    expect(issues[0].field).toBe('operations');
  });

  it('validates standardization operations by kind', () => {
    expect(parseRuleDefinition('STANDARDIZATION', { columns: 'ALL', operation: { kind: 'CLEAN' } })).toEqual({
      columns: 'ALL',
      operation: { kind: 'CLEAN', removeSpecialCharacters: false },
    });
    expect(parseRuleDefinition('STANDARDIZATION', { columns: ['id'], operation: { kind: 'INDEX' } }).operation).toEqual({
      kind: 'INDEX',
      start: 1,
    });
    expect(() =>
      parseRuleDefinition('STANDARDIZATION', { columns: 'ALL', operation: { kind: 'INDEX', start: 1 } }),
    ).toThrow(ValidationError);
    const issues = issuesOf(() =>
      parseRuleDefinition('STANDARDIZATION', { columns: ['a'], operation: { kind: 'TRUNCATE', length: 3, tokens: ['x'] } }),
    );
    expect(issues).toContainEqual({ field: 'operation.tokens', message: 'não se aplica a TRUNCATE' });
  });

  it('validates LOOKUP key pairs and reference ids', () => {
    const lookup = parseRuleDefinition('LOOKUP', {
      keyColumns: ['codigo'],
      referenceSourceIds: [SOURCE_ID.toUpperCase()],
      referenceKeyColumns: ['cod'],
      columnsToBring: ['descricao'],
      matchMode: 'NORMALIZED',
    });
    expect(lookup.referenceSourceIds).toEqual([SOURCE_ID]);
    const issues = issuesOf(() =>
      parseRuleDefinition('LOOKUP', {
        keyColumns: ['a', 'b'],
        referenceSourceIds: ['not-a-uuid'],
        referenceKeyColumns: ['a'],
        columnsToBring: ['c'],
      }),
    );
    expect(issues.map((i) => i.field)).toContain('referenceSourceIds[0]');
  });

  it('requires unique output names in PROJECTION', () => {
    const projection = parseRuleDefinition('PROJECTION', { columns: [{ source: 'a', as: 'valor final' }, { source: 'b' }] });
    expect(projection.columns).toEqual([
      { source: 'A', as: 'VALOR_FINAL' },
      { source: 'B', as: 'B' },
    ]);
    expect(() => parseRuleDefinition('PROJECTION', { columns: [{ source: 'a', as: 'x' }, { source: 'b', as: 'x' }] })).toThrow(
      ValidationError,
    );
  });

  it('recognizes rule types', () => {
    expect(isRuleType('LOOKUP')).toBe(true);
    expect(isRuleType('ALLOCATION')).toBe(false);
  });
});
