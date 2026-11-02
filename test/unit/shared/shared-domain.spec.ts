import { canonicalJson, sha256Hex } from '../../../src/shared/domain/hashing';
import { normalizePageRequest, toSkipTake, totalPages } from '../../../src/shared/domain/pagination';
import { canonicalColumnName, canonicalColumnNames, mergeColumns, toScalar } from '../../../src/shared/domain/tabular';
import { hasDisallowedControlCharacters, isControlCharacter } from '../../../src/shared/domain/text';
import { parseSourceMetadata, sanitizeFileName } from '../../../src/modules/sources/domain/source';
import {
  hasAllPermissions,
  isPermissionCode,
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
} from '../../../src/modules/auth/domain/access-control';

describe('tabular helpers', () => {
  it('canonicalizes column names like the original NormalizeColumnNames', () => {
    expect(canonicalColumnName('  valor  total ')).toBe('VALOR_TOTAL');
    expect(canonicalColumnName('__Nº_Doc__')).toBe('Nº_DOC');
    expect(canonicalColumnNames(['A', 'a', 'A_1', ''])).toEqual(['A', 'A_1', 'A_1_1', 'COLUMN_4']);
  });

  it('converts cells to scalars (dates to ISO)', () => {
    expect(toScalar(new Date(Date.UTC(2026, 0, 31)))).toBe('2026-01-31');
    expect(toScalar(new Date(Date.UTC(2026, 0, 31, 10, 30)))).toBe('2026-01-31T10:30:00.000Z');
    expect(toScalar(Number.NaN)).toBeNull();
    expect(toScalar(undefined)).toBeNull();
    expect(mergeColumns(['A', 'B'], ['B', 'C'])).toEqual(['A', 'B', 'C']);
  });
});

describe('hashing', () => {
  it('produces the same hash regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: 'x' }], u: undefined })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
    expect(sha256Hex(canonicalJson({ a: 1, b: 2 }))).toBe(sha256Hex(canonicalJson({ b: 2, a: 1 })));
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('pagination', () => {
  it('normalizes page requests within bounds', () => {
    expect(normalizePageRequest(undefined, undefined)).toEqual({ page: 1, pageSize: 20 });
    expect(normalizePageRequest(3, 500)).toEqual({ page: 3, pageSize: 100 });
    expect(normalizePageRequest(-1, 0)).toEqual({ page: 1, pageSize: 20 });
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
    expect(totalPages({ totalItems: 21, pageSize: 10 })).toBe(3);
    expect(totalPages({ totalItems: 0, pageSize: 10 })).toBe(0);
  });
});

describe('access-control catalog', () => {
  it('describes every permission and only grants known permissions', () => {
    const codes = Object.values(PERMISSIONS);
    expect(Object.keys(PERMISSION_DESCRIPTIONS).sort()).toEqual([...codes].sort());
    for (const role of ROLE_DEFINITIONS) {
      expect(role.permissions.every((p) => isPermissionCode(p))).toBe(true);
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('gives ADMIN every permission and keeps VIEWER read-only', () => {
    const admin = ROLE_DEFINITIONS.find((r) => r.code === 'ADMIN');
    const viewer = ROLE_DEFINITIONS.find((r) => r.code === 'VIEWER');
    expect(admin?.permissions).toHaveLength(Object.values(PERMISSIONS).length);
    expect(viewer?.permissions.every((p) => p.endsWith(':view'))).toBe(true);
    expect(hasAllPermissions({ permissions: ['rules:view', 'rules:create'] }, ['rules:create'])).toBe(true);
    expect(hasAllPermissions({ permissions: ['rules:view'] }, ['rules:view', 'rules:create'])).toBe(false);
  });
});

describe('control characters and file names', () => {
  it('detects C0 controls and DEL, allowing only tab and line breaks in free text', () => {
    expect(['\u0000', '\u001f', '\u007f'].every(isControlCharacter)).toBe(true);
    expect(['a', ' ', '\u00a0', '', '😀'].some(isControlCharacter)).toBe(false);
    expect(hasDisallowedControlCharacters('linha 1\r\n\tlinha 2')).toBe(false);
    expect(hasDisallowedControlCharacters('a\u0008b')).toBe(true);
    expect(hasDisallowedControlCharacters('fim\u007f')).toBe(true);
  });

  it('keeps only a safe base name limited to 255 code points', () => {
    expect(sanitizeFileName('C:\\dados\\..\\notas.csv')).toBe('notas.csv');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('a\u0000b<c>|d:e*f?"g.csv')).toBe('a_b_c__d_e_f__g.csv');
    expect(sanitizeFileName('  relatório outubro.xlsx  ')).toBe('relatório outubro.xlsx');
    const long = sanitizeFileName(`${'😀'.repeat(300)}.csv`);
    expect(Array.from(long)).toHaveLength(255);
    expect(long.endsWith('😀')).toBe(true);
    expect(sanitizeFileName('pasta/')).toBe('');
  });
});

describe('source metadata', () => {
  it('accepts descriptive pairs and refuses keys that look like credentials', () => {
    expect(parseSourceMetadata({ empresa: ' Matriz ', fase: 'Fechamento' })).toEqual({ metadata: { empresa: 'Matriz', fase: 'Fechamento' }, issues: [] });
    const refused = ['senha', 'dbPassword', 'pwd', 'apiKey', 'client_secret', 'accessToken', 'connectionString', 'connection_string'];
    const { metadata, issues } = parseSourceMetadata(Object.fromEntries(refused.map((key) => [key, 'x'])));
    expect(metadata).toEqual({});
    expect(issues.map((issue) => issue.code)).toEqual(refused.map(() => 'FORBIDDEN_KEY'));
  });
});
