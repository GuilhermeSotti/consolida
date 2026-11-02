import { InputValidator, parsePageQuery } from '../../../src/shared/validation/input';
import { ValidationError } from '../../../src/shared/domain/errors';
import { parseCreateSourceRequest, parseUpdateSourceRequest } from '../../../src/modules/sources/presentation/sources.requests';
import { parseCreateRuleRequest, parseUpdateRuleRequest, parseVersionParam } from '../../../src/modules/rules/presentation/rules.requests';
import { parseIdempotencyKey, parseListExecutionsQuery, parseRequestExecutionBody } from '../../../src/modules/executions/presentation/executions.requests';
import { parseReplaceRolesRequest, parseSetUserStatusRequest } from '../../../src/modules/users/presentation/users.requests';
import { parseExportQuery } from '../../../src/modules/reports/presentation/reports.requests';
import { parseListAuditQuery } from '../../../src/modules/audit/presentation/audit.requests';
import { uuid } from '../../support/fakes';

function details(work: () => unknown): Array<{ field?: string; code?: string }> {
  try {
    work();
  } catch (error) {
    if (error instanceof ValidationError) return error.details;
    throw error;
  }
  throw new Error('expected a ValidationError');
}

describe('InputValidator', () => {
  it('collects every problem with its field path', () => {
    const v = new InputValidator();
    const o = v.object({ name: '  ', extra: 1, age: '7', tags: ['a', 3] }, 'body', ['name', 'age', 'tags']);
    v.string(o.name, 'name', { required: true, max: 10 });
    v.integer(o.age, 'age', { required: true });
    v.array(o.tags, 'tags', { max: 5 }, (entry, path) => v.string(entry, path, { required: true, max: 5 }));
    expect(v.issues.map((issue) => `${issue.field}:${issue.code}`)).toEqual([
      'extra:UNKNOWN_PROPERTY',
      'name:TOO_SHORT',
      'age:INVALID_TYPE',
      'tags[1]:INVALID_TYPE',
    ]);
  });

  it('rejects control characters and line breaks in single-line text', () => {
    const v = new InputValidator();
    v.string('a\u0000b', 'a', { max: 10 });
    v.string('linha\noutra', 'b', { max: 20 });
    expect(v.string('linha\noutra', 'c', { max: 20, multiline: true })).toBe('linha\noutra');
    expect(v.issues.map((issue) => issue.field)).toEqual(['a', 'b']);
  });

  it('bounds paging parameters and rejects unknown query parameters', () => {
    expect(parsePageQuery({ page: '2', pageSize: '50' })).toEqual({ page: 2, pageSize: 50 });
    expect(details(() => parsePageQuery({ pageSize: '1000' }))[0].code).toBe('OUT_OF_RANGE');
    expect(details(() => parsePageQuery({ page: '1', sort: 'x' }))[0]).toEqual(expect.objectContaining({ field: 'sort', code: 'UNKNOWN_PROPERTY' }));
  });
});

describe('request parsers', () => {
  it('sources: validates code, format-specific options, columns and metadata', () => {
    const command = parseCreateSourceRequest({
      code: 'NOTAS_2026',
      name: 'Notas',
      fileFormat: 'CSV',
      csvDelimiter: ';',
      expectedColumns: [{ name: 'nota fiscal' }],
      metadata: { empresa: 'X' },
    });
    expect(command).toEqual(expect.objectContaining({ code: 'NOTAS_2026', csvDelimiter: ';', expectedColumns: [{ name: 'NOTA_FISCAL', required: true }] }));
    const problems = details(() =>
      parseCreateSourceRequest({ code: 'notas', name: 'N', fileFormat: 'XLSX', csvDelimiter: ';', metadata: { senha: 'x' }, expectedColumns: 'A' }),
    );
    expect(problems.map((p) => p.field)).toEqual(expect.arrayContaining(['code', 'csvDelimiter', 'metadata.senha', 'expectedColumns']));
    expect(details(() => parseUpdateSourceRequest({}))[0].code).toBe('EMPTY_UPDATE');
  });

  it('rules: requires definition on create and expectedVersion + changeReason on update', () => {
    expect(details(() => parseCreateRuleRequest({ type: 'FILTER', targetSourceId: uuid(1), name: 'R' })).map((p) => p.field)).toEqual(['definition']);
    expect(details(() => parseUpdateRuleRequest({ name: 'novo' })).map((p) => p.field)).toEqual(['expectedVersion', 'changeReason']);
    expect(parseUpdateRuleRequest({ expectedVersion: 2, changeReason: 'Ajuste fiscal', phase: null })).toEqual({ expectedVersion: 2, changeReason: 'Ajuste fiscal', phase: null });
    expect(parseVersionParam('3')).toBe(3);
    expect(() => parseVersionParam('0')).toThrow(ValidationError);
  });

  it('executions: validates ids, reference overrides, dates and Idempotency-Key', () => {
    const command = parseRequestExecutionBody({ sourceId: uuid(1).toUpperCase(), phase: 'Fase 1', referenceImportIds: { [uuid(2)]: uuid(3) } });
    expect(command).toEqual({ sourceId: uuid(1), phase: 'Fase 1', importId: undefined, referenceImportIds: { [uuid(2)]: uuid(3) } });
    expect(details(() => parseRequestExecutionBody({ sourceId: 'x', referenceImportIds: { abc: 'y' } })).map((p) => p.field)).toEqual([
      'sourceId',
      'referenceImportIds.abc',
      'referenceImportIds.abc',
    ]);
    expect(parseIdempotencyKey(undefined)).toBeNull();
    expect(parseIdempotencyKey('pedido-2026-10-23')).toBe('pedido-2026-10-23');
    expect(() => parseIdempotencyKey('curta')).toThrow(ValidationError);
    expect(details(() => parseListExecutionsQuery({ from: '2026-10-23', to: '2026-10-01' }))[0].field).toBe('to');
  });

  it('users, reports and audit queries', () => {
    expect(parseSetUserStatusRequest({ status: 'INACTIVE' })).toBe('INACTIVE');
    expect(parseReplaceRolesRequest({ roles: ['VIEWER', 'MANAGER'] })).toEqual(['VIEWER', 'MANAGER']);
    expect(details(() => parseReplaceRolesRequest({ roles: ['ROOT'] }))[0].code).toBe('INVALID_ENUM');
    expect(parseExportQuery({})).toBe('csv');
    expect(parseExportQuery({ format: 'xlsx' })).toBe('xlsx');
    expect(() => parseExportQuery({ format: 'pdf' })).toThrow(ValidationError);
    expect(parseListAuditQuery({ action: 'RULE_UPDATED', entityType: 'Rule' }).filter).toEqual(expect.objectContaining({ action: 'RULE_UPDATED', entityType: 'Rule' }));
    expect(() => parseListAuditQuery({ action: "x'; drop table" })).toThrow(ValidationError);
  });
});
