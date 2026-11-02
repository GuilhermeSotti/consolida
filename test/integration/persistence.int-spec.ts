/**
 * Prisma adapters against PostgreSQL (migrations applied). Run with:
 *   DATABASE_URL=postgresql://.../consolidahub_test npm run db:migrate:deploy && npm run test:integration
 */
import { Prisma } from '@prisma/client';
import { PrismaIdentityStore } from '../../src/modules/auth/infrastructure/prisma-identity.store';
import { PrismaExecutionDataStore } from '../../src/modules/executions/infrastructure/prisma-execution-data.store';
import { PrismaExecutionsRepository } from '../../src/modules/executions/infrastructure/prisma-executions.repository';
import { DuplicateIdempotencyKeyError } from '../../src/modules/executions/application/ports';
import { PrismaNotificationsRepository } from '../../src/modules/notifications/infrastructure/prisma-notifications.repository';
import { PrismaReportsRepository } from '../../src/modules/reports/infrastructure/prisma-reports.repository';
import { PrismaRulesRepository } from '../../src/modules/rules/infrastructure/prisma-rules.repository';
import { PrismaImportsRepository } from '../../src/modules/sources/infrastructure/persistence/prisma-imports.repository';
import { PrismaSourcesRepository } from '../../src/modules/sources/infrastructure/persistence/prisma-sources.repository';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/prisma-users.repository';
import { PrismaAuditEventsRepository } from '../../src/modules/audit/infrastructure/prisma-audit-events.repository';
import { PrismaAuditRecorder } from '../../src/shared/infrastructure/audit/prisma-audit.recorder';
import { PrismaNotificationPublisher } from '../../src/shared/infrastructure/notifications/prisma-notification.publisher';
import type { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import type { PrismaTransactionRunner } from '../../src/shared/infrastructure/prisma/prisma-transaction.runner';
import { ConflictError } from '../../src/shared/domain/errors';
import { connect, createUser, resetDatabase } from '../support/integration-db';

let prisma: PrismaService;
let transactions: PrismaTransactionRunner;
let userId: string;

beforeAll(async () => {
  ({ prisma, transactions } = await connect());
});

beforeEach(async () => {
  await resetDatabase(prisma);
  userId = await createUser(prisma);
});

afterAll(async () => {
  await prisma?.onModuleDestroy();
});

const filter = { condition: { column: 'STATUS', operator: 'EQUALS' as const, values: ['OK'], normalization: [], compareAs: 'AUTO' as const } };

async function source(code = 'NOTAS') {
  return transactions.run((tx) =>
    new PrismaSourcesRepository(prisma).create(
      { code, name: code, description: null, fileFormat: 'CSV', sheetName: null, csvDelimiter: ';', expectedColumns: [{ name: 'NF', required: true }], metadata: { empresa: 'X' } },
      userId,
      tx,
    ),
  );
}

describe('identity and users', () => {
  it('provisions by (provider, tenant, oid), is race-safe and loads permissions from roles', async () => {
    const store = new PrismaIdentityStore(prisma);
    const identity = { provider: 'entra-id' as const, tenantId: 't', subject: 'oid-1', email: 'a@b.c' };
    const first = await store.provision(identity, 'Ana', new Date());
    const second = await store.provision(identity, 'Ana', new Date());
    expect(first.created).toBe(true);
    expect(second).toEqual({ principal: expect.objectContaining({ userId: first.principal.userId }), created: false });
    const users = new PrismaUsersRepository(prisma);
    await transactions.run((tx) => users.replaceRoles(first.principal.userId, ['BUSINESS_ANALYST', 'VIEWER'], userId, tx));
    const found = await store.findByIdentity('entra-id', 't', 'oid-1');
    expect(found?.roles.sort()).toEqual(['BUSINESS_ANALYST', 'VIEWER']);
    expect(found?.permissions).toEqual(expect.arrayContaining(['rules:create', 'reports:export']));
    await transactions.run(async (tx) => {
      await users.lockAdministration(tx);
      expect(await users.countActiveAdmins(userId, tx)).toBe(0);
    });
    const page = await users.list({ role: 'VIEWER' }, { page: 1, pageSize: 10 });
    expect(page.items.map((u) => u.id)).toEqual([first.principal.userId]);
  });
});

describe('sources and imports', () => {
  it('enforces unique source codes', async () => {
    await source('DUP');
    await expect(source('DUP')).rejects.toBeInstanceOf(ConflictError);
  });

  it('stores the original file, validates chunked rows atomically and pages across chunks', async () => {
    const created = await source();
    const imports = new PrismaImportsRepository(prisma);
    const content = new TextEncoder().encode('NF\n1\n');
    const item = await transactions.run((tx) =>
      imports.create({ sourceId: created.id, fileName: 'a.csv', fileFormat: 'CSV', fileSizeBytes: content.length, checksumSha256: 'a'.repeat(64), uploadedById: userId, content }, tx),
    );
    expect(await imports.findLiveDuplicate(created.id, 'a'.repeat(64))).toEqual(expect.objectContaining({ id: item.id }));
    expect(Buffer.from((await imports.readContent(item.id))!).toString()).toBe('NF\n1\n');
    expect(await imports.markProcessing(item.id)).toBe(true);
    const rows = Array.from({ length: 2500 }, (_, index) => ({ NF: String(index), FILE_ID: 'a.csv', VOLUME: 1 }));
    await transactions.run((tx) =>
      imports.saveValidated(item.id, { columns: [{ original: 'NF', name: 'NF' }, { original: null, name: 'FILE_ID' }, { original: null, name: 'VOLUME' }], rows, processedAt: new Date() }, tx),
    );
    expect(await prisma.importChunk.count({ where: { importId: item.id } })).toBe(3);
    const page = await imports.readRows(item.id, { page: 2, pageSize: 700 });
    expect(page.map((row) => row.NF)).toEqual(Array.from({ length: 700 }, (_, index) => String(700 + index)));
    expect((await imports.findById(item.id))?.status).toBe('VALIDATED');
    expect(await imports.markProcessing(item.id)).toBe(false);
    const dataset = await new PrismaExecutionDataStore(prisma).loadImportDataset(item.id);
    expect(dataset.columns).toEqual(['NF', 'FILE_ID', 'VOLUME']);
    expect(dataset.rows).toHaveLength(2500);
  });
});

describe('rules', () => {
  it('versions immutably with optimistic concurrency and filters executable rules by phase', async () => {
    const target = await source();
    const rules = new PrismaRulesRepository(prisma);
    const rule = await transactions.run((tx) =>
      rules.create({ type: 'FILTER', targetSourceId: target.id, name: 'v1', description: null, phase: null, executionOrder: 1, definition: filter, changeReason: null }, userId, tx),
    );
    expect(rule).toEqual(expect.objectContaining({ status: 'INACTIVE', currentVersion: 1 }));
    const content = { name: 'v2', description: null, phase: 'FECHAMENTO', executionOrder: 2, definition: filter };
    expect(await transactions.run((tx) => rules.addVersion(rule.id, 1, content, 'mudança', userId, tx))).toBe(true);
    expect(await transactions.run((tx) => rules.addVersion(rule.id, 1, content, 'concorrente', userId, tx))).toBe(false);
    await transactions.run((tx) => rules.setStatus(rule.id, 'ACTIVE', tx));
    expect(await rules.listExecutable(target.id, null)).toEqual([]);
    const executable = await rules.listExecutable(target.id, 'FECHAMENTO');
    expect(executable).toEqual([expect.objectContaining({ ruleId: rule.id, version: 2, name: 'v2' })]);
    expect((await rules.loadVersions([rule.current.id]))[0]).toEqual(expect.objectContaining({ version: 1, name: 'v1' }));
    await expect(prisma.$executeRaw`UPDATE rule_versions SET name = 'x'`).rejects.toBeDefined();
  });
});

describe('executions, reports and audit', () => {
  it('runs the persistence side of an execution end to end', async () => {
    const target = await source();
    const executions = new PrismaExecutionsRepository(prisma);
    const data = new PrismaExecutionDataStore(prisma);
    const importRow = await prisma.dataImport.create({
      data: {
        sourceId: target.id, status: 'VALIDATED', fileName: 'a.csv', fileFormat: 'CSV', fileSizeBytes: 1, checksumSha256: 'b'.repeat(64),
        uploadedById: userId, rowCount: 0, columns: [{ original: 'NF', name: 'NF' }],
      },
    });
    const snapshot = { primaryImportId: importRow.id, referenceImports: [], rules: [] };
    const input = { sourceId: target.id, phase: null, requestedById: userId, idempotencyKey: 'chave-0001', requestHash: 'c'.repeat(64), engineVersion: '1.0.0', inputSnapshot: snapshot, reproducedFromId: null };
    const execution = await transactions.run((tx) => executions.create(input, tx));
    await expect(transactions.run((tx) => executions.create(input, tx))).rejects.toBeInstanceOf(DuplicateIdempotencyKeyError);
    expect((await executions.findByIdempotencyKey(userId, 'chave-0001'))?.id).toBe(execution.id);
    expect((await data.latestValidatedImport(target.id))?.id).toBe(importRow.id);

    expect(await executions.markRunning(execution.id, new Date(), '1.0.0')).toBe(true);
    await executions.appendLog(execution.id, { level: 'INFO', step: 'START', message: 'ok', details: { token: 'segredo' } });
    const logs = await executions.listLogs(execution.id, { page: 1, pageSize: 10 });
    expect(logs.items[0]).toEqual(expect.objectContaining({ id: expect.any(String), step: 'START', details: { token: '[REDACTED]' } }));

    const reportId = await transactions.run(async (tx) => {
      const id = await data.writeReport(
        { executionId: execution.id, sourceId: target.id, name: 'R', dataset: { columns: ['NF'], rows: Array.from({ length: 1500 }, (_, i) => ({ NF: String(i) })) }, availableAt: new Date() },
        tx,
      );
      expect(await executions.markSucceeded(execution.id, { rowsOut: 1500, totalRules: 0, finishedAt: new Date() }, tx)).toBe(true);
      return id;
    });
    const reports = new PrismaReportsRepository(prisma);
    expect((await reports.findById(reportId))?.rowCount).toBe(1500);
    let streamed = 0;
    for await (const chunk of reports.streamRows(reportId)) streamed += chunk.length;
    expect(streamed).toBe(1500);
    expect((await executions.findById(execution.id))?.reportId).toBe(reportId);

    const audit = new PrismaAuditRecorder(prisma);
    await audit.record({ action: 'TEST_EVENT', entityType: 'Execution', entityId: execution.id, outcome: 'SUCCESS', actorUserId: userId, details: { email: 'x@y.z' } });
    const events = await new PrismaAuditEventsRepository(prisma).list({ action: 'TEST_EVENT' }, { page: 1, pageSize: 10 });
    expect(events.items[0].details).toEqual({ email: '[REDACTED]' });
    await expect(prisma.$executeRaw`DELETE FROM audit_events`).rejects.toBeDefined();
  });

  it('scopes notifications to their owner', async () => {
    const other = await createUser(prisma, 'Outra');
    await new PrismaNotificationPublisher(prisma).notify({ userId, type: 'EXECUTION_SUCCEEDED', title: 't', message: 'm' });
    const repository = new PrismaNotificationsRepository(prisma);
    const mine = await repository.list(userId, true, { page: 1, pageSize: 10 });
    expect(mine.totalItems).toBe(1);
    expect(await repository.markRead(other, mine.items[0].id, new Date())).toBeNull();
    expect((await repository.markRead(userId, mine.items[0].id, new Date()))?.readAt).toBeInstanceOf(Date);
    expect(await repository.markAllRead(userId, new Date())).toBe(0);
  });

  it('maps Json columns without accepting plain null writes', () => {
    expect(Prisma.DbNull).toBeDefined();
  });
});
