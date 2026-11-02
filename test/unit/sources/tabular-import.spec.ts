import {
  FILE_ID_COLUMN,
  normalizeTabularImport,
  parseExpectedColumns,
  VOLUME_COLUMN,
} from '../../../src/modules/sources/domain/tabular-import';

describe('parseExpectedColumns', () => {
  it('canonicalizes names and defaults required to true', () => {
    expect(parseExpectedColumns([{ name: 'valor total' }, { name: 'Obs', required: false }])).toEqual({
      columns: [
        { name: 'VALOR_TOTAL', required: true },
        { name: 'OBS', required: false },
      ],
      issues: [],
    });
  });

  it('reports duplicates, invalid entries and unknown properties', () => {
    const { issues } = parseExpectedColumns([{ name: 'A' }, { name: ' a ' }, 'B', { name: 'C', tipo: 'x' }, { name: 'D', required: 'sim' }]);
    expect(issues.map((i) => i.field)).toEqual([
      'expectedColumns[1].name',
      'expectedColumns[2]',
      'expectedColumns[3]',
      'expectedColumns[4].required',
    ]);
    expect(parseExpectedColumns('x').issues).toHaveLength(1);
  });
});

describe('normalizeTabularImport', () => {
  it('builds canonical rows, adds FILE_ID/VOLUME and converts empty strings to null', () => {
    const result = normalizeTabularImport({
      header: ['Nota Fiscal', 'Valor', 'Valor', ''],
      rows: [
        ['001', 10, 11, 'x'],
        ['002', '', null],
      ],
      fileId: 'notas.xlsx/Plan1',
      expectedColumns: [{ name: 'NOTA_FISCAL', required: true }],
    });
    expect(result.issues).toEqual([]);
    expect(result.dataset.columns).toEqual(['NOTA_FISCAL', 'VALOR', 'VALOR_1', 'COLUMN_4', FILE_ID_COLUMN, VOLUME_COLUMN]);
    expect(result.dataset.rows[1]).toEqual({
      NOTA_FISCAL: '002',
      VALOR: null,
      VALOR_1: null,
      COLUMN_4: null,
      FILE_ID: 'notas.xlsx/Plan1',
      VOLUME: 1,
    });
    expect(result.columns[0]).toEqual({ original: 'Nota Fiscal', name: 'NOTA_FISCAL' });
    // Generated columns are part of the persisted column list (otherwise they vanish from reports).
    expect(result.columns.slice(-2)).toEqual([
      { original: null, name: 'FILE_ID' },
      { original: null, name: 'VOLUME' },
    ]);
    expect(result.dataset.columns).toEqual(result.columns.map((column) => column.name));
  });

  it('keeps an existing VOLUME column and overwrites FILE_ID', () => {
    const result = normalizeTabularImport({
      header: ['file id', 'volume'],
      rows: [['antigo', 5]],
      fileId: 'novo.csv',
      expectedColumns: [],
    });
    expect(result.dataset.columns).toEqual(['FILE_ID', 'VOLUME']);
    expect(result.dataset.rows).toEqual([{ FILE_ID: 'novo.csv', VOLUME: 5 }]);
  });

  it('reports missing required columns and rows wider than the header', () => {
    const result = normalizeTabularImport({
      header: ['A'],
      rows: [['1', 'extra'], ['2', '  ']],
      fileId: 'f.csv',
      expectedColumns: [{ name: 'B', required: true }, { name: 'C', required: false }],
    });
    expect(result.issues.map((i) => i.code)).toEqual(['MISSING_COLUMN', 'EXTRA_FIELDS']);
    expect(result.dataset.rows).toHaveLength(1);
  });
});
