/**
 * End-to-end tests of the HTTP API: real NestJS application (guards, pipes, filters,
 * interceptors, helmet, CORS, body limits, multer) with in-memory persistence and access tokens
 * signed by a local test key that the API validates exactly like Entra ID tokens.
 */
import * as XLSX from 'xlsx';
import { ExecutionRunner } from '../../src/modules/executions/application/execution-runner';
import { ImportProcessor } from '../../src/modules/sources/application/import-processor';
import { createE2eApp, type E2eContext } from '../support/e2e-app';
import { generateTestKey, signTestToken, TEST_TENANT, validClaims } from '../support/jwt';
import { uuid } from '../support/fakes';

const ADMIN = '10000000-0000-4000-8000-000000000001';
const ANALYST = '10000000-0000-4000-8000-000000000002';
const OPERATOR = '10000000-0000-4000-8000-000000000003';
const VIEWER = '10000000-0000-4000-8000-000000000004';
const NEWCOMER = '10000000-0000-4000-8000-000000000005';
const MANAGED = '10000000-0000-4000-8000-000000000006';

let ctx: E2eContext;

/** Response envelope as asserted by these tests (contracts/openapi.yaml: ApiSuccess / ApiError). */
interface ErrorBody {
  code: string;
  message: string;
  details: Array<{ field: string; message: string }>;
  requestId: string;
}
interface Body<T> {
  success: boolean;
  data: T;
  metadata: Record<string, unknown>;
  error: ErrorBody;
}
type Entity = { id: string } & Record<string, unknown>;

async function json<T = Entity>(response: Response): Promise<Body<T>> {
  return (await response.json()) as Body<T>;
}

beforeAll(async () => {
  ctx = await createE2eApp();
  await ctx.grant(ADMIN, ['ADMIN']);
  await ctx.grant(ANALYST, ['BUSINESS_ANALYST']);
  await ctx.grant(OPERATOR, ['OPERATIONS']);
  await ctx.grant(VIEWER, ['VIEWER']);
  await ctx.grant(MANAGED, ['VIEWER']);
});

afterAll(async () => {
  await ctx?.close();
});

describe('platform', () => {
  it('serves public health probes and reports the database state', async () => {
    const live = await ctx.request('GET', '/health/live');
    expect(live.status).toBe(200);
    expect(await json(live)).toEqual({ success: true, data: { status: 'ok' } });
    ctx.database.up = false;
    const down = await ctx.request('GET', '/health/ready');
    ctx.database.up = true;
    expect(down.status).toBe(503);
    expect((await json(down)).error.code).toBe('SERVICE_UNAVAILABLE');
    expect((await ctx.request('GET', '/health/ready')).status).toBe(200);
  });

  it('sets security headers, correlation id and no framework fingerprint', async () => {
    const response = await ctx.request('GET', '/health/live', { headers: { 'x-request-id': 'req-abc-12345' } });
    expect(response.headers.get('x-request-id')).toBe('req-abc-12345');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('x-powered-by')).toBeNull();
    const generated = await ctx.request('GET', '/health/live', { headers: { 'x-request-id': '<script>' } });
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows CORS only for configured origins', async () => {
    const allowed = await ctx.request('OPTIONS', '/rules', {
      headers: { origin: 'http://localhost:3001', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    const denied = await ctx.request('OPTIONS', '/rules', { headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns the error envelope for unknown routes, malformed JSON and oversized bodies', async () => {
    const token = ctx.token(ADMIN);
    const missing = await ctx.request('GET', '/does-not-exist', { token });
    expect(missing.status).toBe(404);
    expect((await json(missing)).error).toEqual(expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }));
    const malformed = await ctx.request('POST', '/sources', { token, raw: '{"code":', headers: { 'content-type': 'application/json' } });
    expect(malformed.status).toBe(400);
    expect((await json(malformed)).success).toBe(false);
    const huge = await ctx.request('POST', '/sources', { token, body: { name: 'x'.repeat(1_100_000) } });
    expect(huge.status).toBe(413);
    expect((await json(huge)).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('authentication (Entra ID access tokens)', () => {
  it('requires a bearer token', async () => {
    const response = await ctx.request('GET', '/auth/me');
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="consolidahub"');
    const body = await json(response);
    expect(body).toEqual({ success: false, error: { code: 'MISSING_TOKEN', message: expect.any(String), requestId: expect.any(String) } });
  });

  it('rejects forged, expired, foreign-audience and foreign-tenant tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = signTestToken(generateTestKey('e2e-key'), validClaims(now, { oid: ADMIN }));
    const cases = [
      forged,
      ctx.token(ADMIN, { exp: now - 3600 }),
      ctx.token(ADMIN, { aud: 'api://outra-api' }),
      ctx.token(ADMIN, { tid: uuid(77), iss: `https://login.microsoftonline.com/${uuid(77)}/v2.0` }),
      ctx.token(ADMIN, { scp: 'User.Read' }),
      ctx.token(ADMIN, { azp: uuid(78) }),
      `${ctx.token(ADMIN).split('.').slice(0, 2).join('.')}.`,
    ];
    for (const token of cases) {
      const response = await ctx.request('GET', '/auth/me', { token });
      expect(response.status).toBe(401);
      expect((await json(response)).error.code).toMatch(/INVALID_TOKEN/);
      expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"');
    }
  });

  it('provisions first-time users without roles and ignores role claims in the token', async () => {
    const response = await ctx.request('GET', '/auth/me', { token: ctx.token(NEWCOMER, { roles: ['ADMIN'], name: 'Nova Pessoa' }) });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toEqual(expect.objectContaining({ displayName: 'Nova Pessoa', roles: [], permissions: [] }));
    const forbidden = await ctx.request('GET', '/rules', { token: ctx.token(NEWCOMER, { roles: ['ADMIN'] }) });
    expect(forbidden.status).toBe(403);
    expect((await json(forbidden)).error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(ctx.audit.events.some((event) => event.action === 'ACCESS_DENIED')).toBe(true);
    expect(ctx.audit.events.some((event) => event.action === 'USER_PROVISIONED')).toBe(true);
  });

  it('blocks deactivated users even with a valid token', async () => {
    const subject = '10000000-0000-4000-8000-000000000099';
    const id = await ctx.grant(subject, ['VIEWER']);
    ctx.directory.users.get(id)!.status = 'INACTIVE';
    const response = await ctx.request('GET', '/auth/me', { token: ctx.token(subject) });
    expect(response.status).toBe(403);
    expect((await json(response)).error.code).toBe('USER_INACTIVE');
  });
});

describe('administration', () => {
  it('lets administrators manage roles with safeguards', async () => {
    const admin = ctx.token(ADMIN);
    const viewerId = ctx.directory.userIdOf(MANAGED)!;
    const roles = await ctx.request('GET', '/roles', { token: admin });
    expect((await json<Array<{ code: string }>>(roles)).data.map((role) => role.code)).toContain('BUSINESS_ANALYST');
    const updated = await ctx.request('PUT', `/users/${viewerId}/roles`, { token: admin, body: { roles: ['VIEWER', 'MANAGER'] } });
    expect(updated.status).toBe(200);
    expect((await json(updated)).data.roles).toEqual(['MANAGER', 'VIEWER']);
    const self = await ctx.request('PATCH', `/users/${ctx.directory.userIdOf(ADMIN)}/status`, { token: admin, body: { status: 'INACTIVE' } });
    expect(self.status).toBe(409);
    expect((await json(self)).error.code).toBe('CANNOT_DEACTIVATE_SELF');
    const invalid = await ctx.request('PUT', `/users/${viewerId}/roles`, { token: admin, body: { roles: ['ROOT'], extra: true } });
    expect(invalid.status).toBe(400);
    expect((await json(invalid)).error.details.map((d) => d.field)).toEqual(['extra', 'roles[0]']);
  });

  it('denies user administration to non-administrators and validates ids', async () => {
    expect((await ctx.request('GET', '/users', { token: ctx.token(ANALYST) })).status).toBe(403);
    const badId = await ctx.request('GET', '/users/123', { token: ctx.token(ADMIN) });
    expect(badId.status).toBe(400);
    const list = await ctx.request('GET', '/users?pageSize=2', { token: ctx.token(ADMIN) });
    const body = await json(list);
    expect(body.data).toHaveLength(2);
    expect(body.metadata).toEqual(expect.objectContaining({ page: 1, pageSize: 2, totalPages: expect.any(Number) }));
  });
});

describe('main flow: source → import → rules → execution → report', () => {
  let sourceId: string;
  let importId: string;
  let ruleId: string;
  let executionId: string;
  let reportId: string;

  it('registers a source (OPERATIONS) with validation and unique code', async () => {
    const operator = ctx.token(OPERATOR);
    const body = {
      code: 'NOTAS_2026',
      name: 'Notas fiscais 2026',
      fileFormat: 'CSV',
      csvDelimiter: ';',
      expectedColumns: [{ name: 'Nota Fiscal' }, { name: 'Status' }, { name: 'Valor' }],
      metadata: { empresa: 'Matriz' },
    };
    const created = await ctx.request('POST', '/sources', { token: operator, body });
    expect(created.status).toBe(201);
    const source = (await json<Entity & { expectedColumns: Array<{ name: string }> }>(created)).data;
    sourceId = source.id;
    expect(source.expectedColumns.map((c) => c.name)).toEqual(['NOTA_FISCAL', 'STATUS', 'VALOR']);
    const duplicate = await ctx.request('POST', '/sources', { token: operator, body });
    expect(duplicate.status).toBe(409);
    expect((await json(duplicate)).error.code).toBe('SOURCE_CODE_TAKEN');
    const invalid = await ctx.request('POST', '/sources', { token: operator, body: { ...body, code: 'x', metadata: { senha: '123' } } });
    expect(invalid.status).toBe(400);
    expect((await ctx.request('POST', '/sources', { token: ctx.token(ANALYST), body })).status).toBe(403);
  });

  it('uploads a CSV (multipart) and validates it asynchronously', async () => {
    const form = new FormData();
    const csv = 'Nota Fiscal;Status;Valor\n001;OK;10,50\n002;ERRO;7\n003;OK;=1+2\n';
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'notas-outubro.csv');
    const upload = await ctx.request('POST', `/sources/${sourceId}/imports`, { token: ctx.token(OPERATOR), raw: form });
    expect(upload.status).toBe(202);
    const received = (await json(upload)).data;
    importId = received.id;
    expect(received).toEqual(expect.objectContaining({ status: 'RECEIVED', fileName: 'notas-outubro.csv', fileFormat: 'CSV' }));
    expect(ctx.jobs.jobs.at(-1)).toEqual(expect.objectContaining({ type: 'PROCESS_IMPORT', payload: { importId } }));

    const again = new FormData();
    again.append('file', new Blob([csv], { type: 'text/csv' }), 'copia.csv');
    const duplicate = await ctx.request('POST', `/sources/${sourceId}/imports`, { token: ctx.token(OPERATOR), raw: again });
    expect(duplicate.status).toBe(409);

    const wrong = new FormData();
    wrong.append('file', new Blob(['PK\u0003\u0004xx']), 'planilha.xlsx');
    expect((await ctx.request('POST', `/sources/${sourceId}/imports`, { token: ctx.token(OPERATOR), raw: wrong })).status).toBe(400);

    await ctx.app.get(ImportProcessor, { strict: false }).process(importId);
    const validated = await json(await ctx.request('GET', `/imports/${importId}`, { token: ctx.token(VIEWER) }));
    expect(validated.data).toEqual(expect.objectContaining({ status: 'VALIDATED', rowCount: 3 }));
    const rows = await json<Array<Record<string, unknown>>>(await ctx.request('GET', `/imports/${importId}/rows?pageSize=2`, { token: ctx.token(VIEWER) }));
    expect(rows.data[0]).toEqual({ NOTA_FISCAL: '001', STATUS: 'OK', VALOR: '10,50', FILE_ID: 'notas-outubro.csv', VOLUME: 1 });
    expect(rows.metadata.totalItems).toBe(3);
  });

  it('rejects uploads larger than the configured limit with 413', async () => {
    const form = new FormData();
    form.append('file', new Blob(['A\n' + 'x'.repeat(70_000)]), 'grande.csv');
    const response = await ctx.request('POST', `/sources/${sourceId}/imports`, { token: ctx.token(OPERATOR), raw: form });
    expect(response.status).toBe(413);
  });

  it('creates, activates and versions a rule (BUSINESS_ANALYST)', async () => {
    const analyst = ctx.token(ANALYST);
    const created = await ctx.request('POST', '/rules', {
      token: analyst,
      body: {
        type: 'FILTER',
        targetSourceId: sourceId,
        name: 'Somente notas OK',
        executionOrder: 1,
        definition: { condition: { column: 'status', operator: 'EQUALS', values: ['OK'] } },
      },
    });
    expect(created.status).toBe(201);
    const rule = (await json(created)).data;
    ruleId = rule.id;
    expect(rule).toEqual(expect.objectContaining({ status: 'INACTIVE', currentVersion: 1 }));
    const invalid = await ctx.request('POST', '/rules', {
      token: analyst,
      body: { type: 'FILTER', targetSourceId: sourceId, name: 'x', definition: { condition: { column: 'A', operator: 'LIKE', values: ['x'] } } },
    });
    expect((await json(invalid)).error.code).toBe('INVALID_RULE_DEFINITION');
    expect((await ctx.request('POST', `/rules/${ruleId}/activate`, { token: analyst })).status).toBe(200);
    const stale = await ctx.request('PATCH', `/rules/${ruleId}`, { token: analyst, body: { expectedVersion: 7, name: 'x', changeReason: 'teste' } });
    expect(stale.status).toBe(409);
    expect((await json(stale)).error.code).toBe('RULE_VERSION_CONFLICT');
    const updated = await ctx.request('PATCH', `/rules/${ruleId}`, { token: analyst, body: { expectedVersion: 1, name: 'Notas OK', changeReason: 'Renomeia' } });
    expect((await json(updated)).data).toEqual(expect.objectContaining({ currentVersion: 2, status: 'ACTIVE' }));
    const versions = await json<Array<{ version: number; name: string }>>(await ctx.request('GET', `/rules/${ruleId}/versions`, { token: ctx.token(VIEWER) }));
    expect(versions.data.map((v) => `${v.version}:${v.name}`)).toEqual(['2:Notas OK', '1:Somente notas OK']);
    expect((await ctx.request('GET', `/rules/${ruleId}/versions/1`, { token: ctx.token(VIEWER) })).status).toBe(200);
    expect((await ctx.request('PATCH', `/rules/${ruleId}`, { token: ctx.token(VIEWER), body: { expectedVersion: 2, changeReason: 'x' } })).status).toBe(403);
  });

  it('requests an execution idempotently and runs it in the worker', async () => {
    const operator = ctx.token(OPERATOR);
    const headers = { 'idempotency-key': 'exec-notas-2026-10' };
    const first = await ctx.request('POST', '/executions', { token: operator, body: { sourceId }, headers });
    expect(first.status).toBe(202);
    const execution = (await json(first)).data;
    executionId = execution.id;
    expect(first.headers.get('location')).toBe(`/api/v1/executions/${executionId}`);
    expect(execution.inputSnapshot).toEqual({
      primaryImportId: importId,
      referenceImports: [],
      rules: [{ ruleId, ruleVersionId: expect.any(String), version: 2 }],
    });
    const replay = await ctx.request('POST', '/executions', { token: operator, body: { sourceId }, headers });
    expect(replay.status).toBe(200);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect((await json(replay)).data.id).toBe(executionId);
    const reused = await ctx.request('POST', '/executions', { token: operator, body: { sourceId, phase: 'Outra' }, headers });
    expect(reused.status).toBe(409);

    await ctx.app.get(ExecutionRunner, { strict: false }).run(executionId);
    const done = (await json(await ctx.request('GET', `/executions/${executionId}`, { token: ctx.token(VIEWER) }))).data;
    expect(done).toEqual(expect.objectContaining({ status: 'SUCCEEDED', rowsIn: 3, rowsOut: 2 }));
    const logs = await json<Array<{ step: string }>>(await ctx.request('GET', `/executions/${executionId}/logs`, { token: ctx.token(VIEWER) }));
    expect(logs.data.map((log) => log.step)).toEqual(['QUEUED', 'START', 'INPUTS_LOADED', 'RULE 1/1', 'DONE']);
    expect((await ctx.request('POST', `/executions/${executionId}/cancel`, { token: operator })).status).toBe(409);
    expect((await ctx.request('POST', '/executions', { token: ctx.token(VIEWER), body: { sourceId } })).status).toBe(403);
  });

  it('lists the consolidated report and exports CSV safely', async () => {
    const reports = await json<Entity[]>(await ctx.request('GET', '/reports', { token: ctx.token(VIEWER) }));
    reportId = reports.data[0].id;
    expect(reports.data[0]).toEqual(expect.objectContaining({ executionId, rowCount: 2, columns: ['NOTA_FISCAL', 'STATUS', 'VALOR', 'FILE_ID', 'VOLUME'] }));
    const rows = await json<Array<{ NOTA_FISCAL: string }>>(await ctx.request('GET', `/reports/${reportId}/rows`, { token: ctx.token(VIEWER) }));
    expect(rows.data.map((row) => row.NOTA_FISCAL)).toEqual(['001', '003']);

    expect((await ctx.request('GET', `/reports/${reportId}/export`, { token: ctx.token(VIEWER) })).status).toBe(403);
    const exported = await ctx.request('GET', `/reports/${reportId}/export?format=csv`, { token: ctx.token(ANALYST) });
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-type')).toContain('text/csv');
    expect(exported.headers.get('content-disposition')).toMatch(/^attachment; filename="relatorio-consolidado-.*\.csv"$/);
    expect(exported.headers.get('cache-control')).toBe('no-store');
    const bytes = new Uint8Array(await exported.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('NOTA_FISCAL;STATUS;VALOR;FILE_ID;VOLUME\r\n001;OK;"10,50";notas-outubro.csv;1\r\n');
    expect(text).toContain("003;OK;'=1+2;");
    expect(ctx.audit.events.some((event) => event.action === 'REPORT_EXPORTED' && event.entityId === reportId)).toBe(true);
  });

  it('exports XLSX', async () => {
    const exported = await ctx.request('GET', `/reports/${reportId}/export?format=xlsx`, { token: ctx.token(ANALYST) });
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-type')).toContain('spreadsheetml');
    const bytes = new Uint8Array(await exported.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('aborts the download instead of delivering a truncated file when reading fails mid-export', async () => {
    ctx.reports.failAfterChunks = 1;
    try {
      const started = await ctx.request('GET', `/reports/${reportId}/export?format=csv`, { token: ctx.token(ANALYST) });
      expect(started.status).toBe(200);
      await expect(started.arrayBuffer()).rejects.toThrow();
      // XLSX is assembled before the response starts: the failure becomes a generic 500 envelope.
      ctx.reports.failAfterChunks = 0;
      const failed = await ctx.request('GET', `/reports/${reportId}/export?format=xlsx`, { token: ctx.token(ANALYST) });
      expect(failed.status).toBe(500);
      const body = await json(failed);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('falha simulada');
    } finally {
      ctx.reports.failAfterChunks = null;
    }
  });

  it('notifies the requester and scopes notifications to their owner', async () => {
    const mine = await json<Array<Entity & { type: string }>>(await ctx.request('GET', '/notifications?unreadOnly=true', { token: ctx.token(OPERATOR) }));
    const types = mine.data.map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['IMPORT_VALIDATED', 'EXECUTION_SUCCEEDED']));
    const notificationId = mine.data[0].id;
    const foreign = await ctx.request('POST', `/notifications/${notificationId}/read`, { token: ctx.token(ANALYST) });
    expect(foreign.status).toBe(404);
    const read = await ctx.request('POST', `/notifications/${notificationId}/read`, { token: ctx.token(OPERATOR) });
    expect((await json(read)).data.readAt).toEqual(expect.any(String));
    const all = await json(await ctx.request('POST', '/notifications/read-all', { token: ctx.token(OPERATOR) }));
    expect(all.data.updated).toBe(mine.data.length - 1);
  });

  it('keeps an audit trail visible only to auditors', async () => {
    expect((await ctx.request('GET', '/audit-events', { token: ctx.token(ANALYST) })).status).toBe(403);
    const audit = await json<Array<{ action: string }>>(await ctx.request('GET', '/audit-events?pageSize=100', { token: ctx.token(ADMIN) }));
    const actions = audit.data.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining(['SOURCE_CREATED', 'IMPORT_RECEIVED', 'IMPORT_VALIDATED', 'RULE_CREATED', 'RULE_ACTIVATED', 'RULE_UPDATED', 'EXECUTION_REQUESTED', 'EXECUTION_SUCCEEDED', 'REPORT_EXPORTED']),
    );
    void TEST_TENANT;
  });
});

describe('XLSX imports', () => {
  it('reads the configured worksheet, keeps numbers and converts dates to ISO', async () => {
    const operator = ctx.token(OPERATOR);
    const created = await ctx.request('POST', '/sources', {
      token: operator,
      body: { code: 'FORNECEDORES', name: 'Fornecedores', fileFormat: 'XLSX', sheetName: 'Dados', expectedColumns: [{ name: 'Código' }] },
    });
    const sourceId = (await json(created)).data.id;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ignorar']]), 'Capa');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Código', 'Nome', 'Limite', 'Desde'], ['A1', 'Alfa', 1500.5, new Date(Date.UTC(2026, 0, 31))]], { cellDates: true }),
      'Dados',
    );
    const content: Uint8Array = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const form = new FormData();
    form.append('file', new Blob([content]), 'fornecedores.xlsx');
    const upload = await ctx.request('POST', `/sources/${sourceId}/imports`, { token: operator, raw: form });
    expect(upload.status).toBe(202);
    const importId = (await json(upload)).data.id;
    await ctx.app.get(ImportProcessor, { strict: false }).process(importId);
    const rows = await json(await ctx.request('GET', `/imports/${importId}/rows`, { token: operator }));
    expect(rows.data).toEqual([{ CÓDIGO: 'A1', NOME: 'Alfa', LIMITE: 1500.5, DESDE: '2026-01-31', FILE_ID: 'fornecedores.xlsx', VOLUME: 1 }]);
  });

  it('rejects a workbook without the configured worksheet', async () => {
    const operator = ctx.token(OPERATOR);
    const created = await ctx.request('POST', '/sources', {
      token: operator,
      body: { code: 'SEM_ABA', name: 'Sem aba', fileFormat: 'XLSX', sheetName: 'Inexistente' },
    });
    const sourceId = (await json(created)).data.id;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['A'], [1]]), 'Plan1');
    const form = new FormData();
    form.append('file', new Blob([XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })]), 'x.xlsx');
    const importId = (await json(await ctx.request('POST', `/sources/${sourceId}/imports`, { token: operator, raw: form }))).data.id;
    await ctx.app.get(ImportProcessor, { strict: false }).process(importId);
    const result = (await json(await ctx.request('GET', `/imports/${importId}`, { token: operator }))).data;
    expect(result.status).toBe('REJECTED');
    expect(result.validationErrors).toEqual([expect.objectContaining({ code: 'SHEET_NOT_FOUND' })]);
  });
});
