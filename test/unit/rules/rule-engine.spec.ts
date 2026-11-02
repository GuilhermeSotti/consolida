import type { Dataset } from '../../../src/shared/domain/tabular';
import type { ExecutableRule, RuleDefinitionByType, RuleType } from '../../../src/modules/rules/domain/rule-definition';
import {
  applyArithmetic,
  applyConditionalAssignment,
  applyFilter,
  applyLookup,
  applyProjection,
  applyStandardization,
  NO_DATA_TOKEN,
} from '../../../src/modules/rules/domain/engine/operations';
import {
  EngineCancelledError,
  EngineLimitError,
  runRules,
  sortRules,
} from '../../../src/modules/rules/domain/engine/rule-engine';

const REF_A = '11111111-1111-4111-8111-111111111111';
const REF_B = '22222222-2222-4222-8222-222222222222';

function dataset(columns: string[], rows: Array<Record<string, string | number | boolean | null>>): Dataset {
  return { columns, rows };
}

function rule<T extends RuleType>(
  type: T,
  definition: RuleDefinitionByType[T],
  overrides: Partial<ExecutableRule<T>> = {},
): ExecutableRule {
  return {
    ruleId: overrides.ruleId ?? `00000000-0000-4000-8000-00000000000${type.length % 10}`,
    ruleVersionId: overrides.ruleVersionId ?? '00000000-0000-4000-8000-0000000000ff',
    version: overrides.version ?? 1,
    name: overrides.name ?? type,
    type,
    executionOrder: overrides.executionOrder ?? 0,
    definition,
  } as ExecutableRule;
}

const invoices = dataset(
  ['NF', 'FORNECEDOR', 'VALOR', 'STATUS'],
  [
    { NF: '001', FORNECEDOR: 'ACME', VALOR: 100, STATUS: 'pago' },
    { NF: '002', FORNECEDOR: 'ACME', VALOR: '250,50', STATUS: 'pendente' },
    { NF: '003', FORNECEDOR: 'XPTO', VALOR: null, STATUS: 'cancelado' },
  ],
);

describe('rule operations', () => {
  it('FILTER keeps matching rows and never mutates the input', () => {
    const snapshot = JSON.stringify(invoices);
    const outcome = applyFilter(invoices, {
      condition: { column: 'STATUS', operator: 'NOT_EQUALS', values: ['CANCELADO'], normalization: ['UPPERCASE'], compareAs: 'AUTO' },
    });
    expect(outcome.dataset.rows.map((r) => r.NF)).toEqual(['001', '002']);
    expect(outcome.affectedRows).toBe(1);
    expect(JSON.stringify(invoices)).toBe(snapshot);
  });

  it('FILTER on a missing column is a no-op with a warning', () => {
    const outcome = applyFilter(invoices, {
      condition: { column: 'INEXISTENTE', operator: 'EQUALS', values: ['x'], normalization: [], compareAs: 'AUTO' },
    });
    expect(outcome.dataset).toBe(invoices);
    expect(outcome.warnings[0]).toContain('INEXISTENTE');
  });

  it('CONDITIONAL_ASSIGNMENT writes literals or copies columns only where the condition holds (ANY value)', () => {
    const outcome = applyConditionalAssignment(invoices, {
      condition: { column: 'STATUS', operator: 'EQUALS', values: ['pago', 'pendente'], normalization: [], compareAs: 'AUTO' },
      targetColumn: 'CLASSE',
      value: { kind: 'LITERAL', value: 'ATIVA' },
    });
    expect(outcome.dataset.columns).toEqual(['NF', 'FORNECEDOR', 'VALOR', 'STATUS', 'CLASSE']);
    expect(outcome.dataset.rows.map((r) => r.CLASSE)).toEqual(['ATIVA', 'ATIVA', null]);
    expect(outcome.affectedRows).toBe(2);

    const copied = applyConditionalAssignment(outcome.dataset, {
      condition: { column: 'FORNECEDOR', operator: 'EQUALS', values: ['XPTO'], normalization: [], compareAs: 'AUTO' },
      targetColumn: 'CLASSE',
      value: { kind: 'COLUMN', column: 'STATUS' },
    });
    expect(copied.dataset.rows.map((r) => r.CLASSE)).toEqual(['ATIVA', 'ATIVA', 'cancelado']);
  });

  it('ARITHMETIC folds operands, treats blanks as zero and moves the target column to the end', () => {
    const data = dataset(['A', 'TOTAL', 'B'], [
      { A: 10, TOTAL: 'old', B: '2,5' },
      { A: null, TOTAL: null, B: 4 },
    ]);
    const outcome = applyArithmetic(data, { operands: ['A', 'B'], operations: ['MULTIPLY'], targetColumn: 'TOTAL' });
    expect(outcome.dataset.columns).toEqual(['A', 'B', 'TOTAL']);
    expect(outcome.dataset.rows.map((r) => r.TOTAL)).toEqual([25, 0]);
  });

  it('ARITHMETIC returns null (with warning) on division by zero and averages by row count', () => {
    const data = dataset(['A', 'B'], [
      { A: 10, B: 0 },
      { A: 30, B: 3 },
    ]);
    const divided = applyArithmetic(data, { operands: ['A', 'B'], operations: ['DIVIDE'], targetColumn: 'R' });
    expect(divided.dataset.rows.map((r) => r.R)).toEqual([null, 10]);
    expect(divided.warnings.join(' ')).toContain('divisão por zero');
    const averaged = applyArithmetic(data, { operands: ['A', 'B'], operations: ['AVERAGE_BY_ROW_COUNT'], targetColumn: 'M' });
    expect(averaged.dataset.rows.map((r) => r.M)).toEqual([5, 15]);
  });

  it('STANDARDIZATION applies each operation kind', () => {
    const data = dataset(['T'], [{ T: '  Ação Nº 12.3  ' }, { T: null }, { T: 98765 }]);
    const run = (operation: RuleDefinitionByType['STANDARDIZATION']['operation']) =>
      applyStandardization(data, { columns: ['T'], operation }).dataset.rows.map((r) => r.T);
    expect(run({ kind: 'TRUNCATE', length: 4 })).toEqual(['  Aç', null, '9876']);
    expect(run({ kind: 'REMOVE', substrings: ['Nº', ' '] })).toEqual(['Ação12.3', null, '98765']);
    expect(run({ kind: 'CLEAN', removeSpecialCharacters: true })).toEqual(['  acao n 123  ', null, '98765']);
    expect(run({ kind: 'KEEP', tokens: ['AÇÃO', 'zzz'] })).toEqual(['AÇÃO', null, null]);
    expect(run({ kind: 'TRIM' })).toEqual(['Ação Nº 12.3', null, '98765']);
    expect(run({ kind: 'REPLACE_SPACES', replacement: '_' })).toEqual(['__Ação_Nº_12.3__', null, '98765']);
    expect(run({ kind: 'NORMALIZE' })).toEqual(['açãonº123', null, '98765']);
  });

  it('STANDARDIZATION INDEX renumbers the column from start and moves it to the end', () => {
    const data = dataset(['ID', 'X'], [{ ID: 'a', X: 1 }, { ID: 'b', X: 2 }]);
    const outcome = applyStandardization(data, { columns: ['ID'], operation: { kind: 'INDEX', start: 100 } });
    expect(outcome.dataset.columns).toEqual(['X', 'ID']);
    expect(outcome.dataset.rows.map((r) => r.ID)).toEqual([100, 101]);
  });

  it('STANDARDIZATION over ALL columns ignores nothing and reports missing explicit columns', () => {
    const data = dataset(['A', 'B'], [{ A: ' x ', B: ' y ' }]);
    expect(applyStandardization(data, { columns: 'ALL', operation: { kind: 'TRIM' } }).dataset.rows[0]).toEqual({ A: 'x', B: 'y' });
    const partial = applyStandardization(data, { columns: ['A', 'Z'], operation: { kind: 'TRIM' } });
    expect(partial.warnings[0]).toContain('Z');
  });

  describe('LOOKUP', () => {
    const suppliers = dataset(['COD', 'NOME', 'UF'], [
      { COD: '0010', NOME: 'Acme Ltda', UF: 'SP' },
      { COD: '10', NOME: 'Acme duplicada', UF: 'RJ' },
      { COD: '20', NOME: 'Xpto SA', UF: 'MG' },
      { COD: null, NOME: 'Sem código', UF: null },
    ]);
    const main = dataset(['FORN', 'UF', 'VALOR'], [
      { FORN: '10', UF: null, VALOR: 1 },
      { FORN: '20', UF: 'BA', VALOR: 2 },
      { FORN: '99', UF: null, VALOR: 3 },
      { FORN: '', UF: null, VALOR: 4 },
    ]);
    const references = new Map([[REF_A, suppliers]]);

    it('EXACT adds only absent columns and duplicates rows when normalized keys repeat', () => {
      const outcome = applyLookup(
        main,
        { keyColumns: ['FORN'], referenceSourceIds: [REF_A], referenceKeyColumns: ['COD'], columnsToBring: ['NOME', 'UF'], matchMode: 'EXACT' },
        references,
      );
      expect(outcome.dataset.columns).toEqual(['FORN', 'UF', 'VALOR', 'NOME']);
      expect(outcome.dataset.rows.map((r) => [r.FORN, r.NOME, r.UF])).toEqual([
        ['10', 'Acme Ltda', null],
        ['10', 'Acme duplicada', null],
        ['20', 'Xpto SA', 'BA'],
        ['99', null, null],
        ['', 'Sem código', null],
      ]);
    });

    it('NORMALIZED keeps one match, coalesces blanks and writes NO DATA for blank reference keys', () => {
      const outcome = applyLookup(
        main,
        { keyColumns: ['FORN'], referenceSourceIds: [REF_A], referenceKeyColumns: ['COD'], columnsToBring: ['NOME', 'UF'], matchMode: 'NORMALIZED' },
        references,
      );
      // Requested columns (reference keys first) are moved to the end, as in the original script.
      expect(outcome.dataset.columns).toEqual(['FORN', 'VALOR', 'COD', 'NOME', 'UF']);
      expect(outcome.dataset.rows).toEqual([
        { FORN: '10', VALOR: 1, COD: '0010', NOME: 'Acme Ltda', UF: 'SP' },
        { FORN: '20', VALOR: 2, COD: '20', NOME: 'Xpto SA', UF: 'BA' },
        { FORN: '99', VALOR: 3, COD: null, NOME: null, UF: null },
        { FORN: '', VALOR: 4, COD: NO_DATA_TOKEN, NOME: NO_DATA_TOKEN, UF: NO_DATA_TOKEN },
      ]);
    });

    it('builds the base from the reference when the dataset is empty and unions several references', () => {
      const other = dataset(['COD', 'NOME'], [{ COD: '30', NOME: 'Outro' }]);
      const outcome = applyLookup(
        dataset(['FORN', 'NOME'], []),
        { keyColumns: ['FORN'], referenceSourceIds: [REF_A, REF_B], referenceKeyColumns: ['COD'], columnsToBring: ['NOME'], matchMode: 'EXACT' },
        new Map([[REF_A, suppliers], [REF_B, other]]),
      );
      expect(outcome.dataset.rows.map((r) => r.FORN)).toEqual(['0010', '10', '20', null, '30']);
      expect(outcome.dataset.rows.map((r) => r.NOME)).toEqual(['Acme Ltda', 'Acme duplicada', 'Xpto SA', 'Sem código', 'Outro']);
    });

    it('warns and keeps the dataset when references are missing', () => {
      const outcome = applyLookup(
        main,
        { keyColumns: ['FORN'], referenceSourceIds: [REF_B], referenceKeyColumns: ['COD'], columnsToBring: ['NOME'], matchMode: 'EXACT' },
        references,
      );
      expect(outcome.warnings[0]).toContain(REF_B);
      expect(outcome.dataset.columns).toContain('NOME');
      expect(outcome.dataset.rows.every((r) => r.NOME === null)).toBe(true);
    });
  });

  it('PROJECTION selects, orders and renames existing columns', () => {
    const outcome = applyProjection(invoices, {
      columns: [
        { source: 'VALOR', as: 'VALOR_TOTAL' },
        { source: 'NF', as: 'NOTA' },
        { source: 'NAO_EXISTE', as: 'X' },
      ],
    });
    expect(outcome.dataset.columns).toEqual(['VALOR_TOTAL', 'NOTA']);
    expect(outcome.dataset.rows[1]).toEqual({ VALOR_TOTAL: '250,50', NOTA: '002' });
    expect(outcome.warnings[0]).toContain('NAO_EXISTE');
  });
});

describe('runRules', () => {
  const definitions = {
    filter: rule('FILTER', {
      condition: { column: 'TOTAL', operator: 'GREATER_THAN', values: [100], normalization: [], compareAs: 'NUMBER' },
    }, { ruleId: 'aaaaaaaa-0000-4000-8000-000000000001' }),
    arithmetic: rule('ARITHMETIC', { operands: ['VALOR'], operations: [], targetColumn: 'TOTAL' }, { ruleId: 'aaaaaaaa-0000-4000-8000-000000000002' }),
    projection: rule('PROJECTION', { columns: [{ source: 'NF', as: 'NF' }, { source: 'TOTAL', as: 'TOTAL' }] }, { ruleId: 'aaaaaaaa-0000-4000-8000-000000000003' }),
  };

  it('orders rules by stage (as ApplyAll), then executionOrder and id', () => {
    const ordered = sortRules([
      definitions.projection,
      definitions.filter,
      { ...definitions.arithmetic, executionOrder: 5 },
      { ...definitions.arithmetic, ruleId: 'aaaaaaaa-0000-4000-8000-000000000000', executionOrder: 5 },
    ]);
    expect(ordered.map((r) => r.type)).toEqual(['ARITHMETIC', 'ARITHMETIC', 'FILTER', 'PROJECTION']);
    expect(ordered[0].ruleId).toBe('aaaaaaaa-0000-4000-8000-000000000000');
  });

  it('applies rules deterministically and reports each step', async () => {
    const result = await runRules({
      dataset: invoices,
      references: new Map(),
      rules: [definitions.projection, definitions.filter, definitions.arithmetic],
    });
    expect(result.dataset).toEqual({ columns: ['NF', 'TOTAL'], rows: [{ NF: '002', TOTAL: 250.5 }] });
    expect(result.steps.map((s) => [s.type, s.rowsBefore, s.rowsAfter])).toEqual([
      ['ARITHMETIC', 3, 3],
      ['FILTER', 3, 1],
      ['PROJECTION', 1, 1],
    ]);
    const again = await runRules({ dataset: invoices, references: new Map(), rules: [definitions.arithmetic, definitions.filter, definitions.projection] });
    expect(again.dataset).toEqual(result.dataset);
  });

  it('stops before the next rule when cancellation is requested', async () => {
    let calls = 0;
    await expect(
      runRules(
        { dataset: invoices, references: new Map(), rules: [definitions.arithmetic, definitions.filter] },
        { shouldCancel: () => calls++ > 0 },
      ),
    ).rejects.toBeInstanceOf(EngineCancelledError);
  });

  it('enforces the maximum number of rows produced by a step', async () => {
    const big = dataset(['K'], [{ K: '1' }]);
    const reference = dataset(['K', 'V'], [{ K: '1', V: 'a' }, { K: '01', V: 'b' }, { K: '001', V: 'c' }]);
    await expect(
      runRules(
        {
          dataset: big,
          references: new Map([[REF_A, reference]]),
          rules: [rule('LOOKUP', { keyColumns: ['K'], referenceSourceIds: [REF_A], referenceKeyColumns: ['K'], columnsToBring: ['V'], matchMode: 'EXACT' })],
        },
        { maxRows: 2 },
      ),
    ).rejects.toBeInstanceOf(EngineLimitError);
  });

  it('aborts a multiplying LOOKUP while the join is built (memory stays bounded by the limit)', async () => {
    const base = dataset(['K'], Array.from({ length: 1_000 }, () => ({ K: 'x' })));
    // Keys that differ only by case/dots/spaces normalize to the same key and multiply the rows.
    const reference = dataset(['K', 'V'], Array.from({ length: 1_000 }, (_, index) => ({ K: index % 2 ? 'X' : `x.${' '.repeat(index % 7)}`, V: index })));
    const error = await runRules(
      {
        dataset: base,
        references: new Map([[REF_A, reference]]),
        rules: [rule('LOOKUP', { keyColumns: ['K'], referenceSourceIds: [REF_A], referenceKeyColumns: ['K'], columnsToBring: ['V'], matchMode: 'EXACT' })],
      },
      { maxRows: 5_000 },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EngineLimitError);
    // Without the in-join check the step would have built up to 1 000 × 1 000 rows before failing.
    expect((error as EngineLimitError).rows).toBe(5_001);
  });
});
