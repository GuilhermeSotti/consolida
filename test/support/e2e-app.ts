/**
 * Builds the real HTTP application (AppModule + configureHttpApplication: guards, filters,
 * interceptors, helmet, CORS, body limits, multer) with every Prisma-backed adapter replaced by
 * in-memory fakes and the Entra JWKS replaced by a local test key. Used by test/e2e.
 */
import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadAppConfig, type AppConfig } from '../../src/config/app-config';
import { configureHttpApplication } from '../../src/http-app';
import { AUDIT_EVENTS_REPOSITORY, type AuditEventsRepository, type AuditEventView } from '../../src/modules/audit/application/audit-query.service';
import { AUTH_TOKENS, type IdentityStore, type StoredPrincipal, type VerifiedIdentity } from '../../src/modules/auth/application/ports';
import { ROLE_DEFINITIONS } from '../../src/modules/auth/domain/access-control';
import { EntraTokenVerifier } from '../../src/modules/auth/infrastructure/entra-token.verifier';
import { AccessTokenVerifier } from '../../src/modules/auth/infrastructure/jwt/access-token.verifier';
import { EXECUTIONS_TOKENS } from '../../src/modules/executions/application/ports';
import { NOTIFICATIONS_REPOSITORY, type NotificationsRepository, type NotificationView } from '../../src/modules/notifications/application/notifications.service';
import { REPORTS_TOKENS, type ReportsRepository, type ReportView } from '../../src/modules/reports/application/ports';
import { RULES_REPOSITORY } from '../../src/modules/rules/application/ports';
import { SOURCES_TOKENS } from '../../src/modules/sources/application/ports';
import { USERS_REPOSITORY, type RoleView, type UserFilter, type UsersRepository, type UserStatus, type UserView } from '../../src/modules/users/application/ports';
import type { AuditEntry, AuditRecorder, NotificationInput, NotificationPublisher, TransactionContext } from '../../src/shared/application/ports';
import { TOKENS } from '../../src/shared/application/ports';
import type { Page, PageRequest } from '../../src/shared/domain/pagination';
import type { Row } from '../../src/shared/domain/tabular';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { FakeJobs, FakeTransactions, TX, uuid } from './fakes';
import { InMemoryExecutionData, InMemoryExecutions } from './in-memory-executions';
import { InMemoryRules } from './in-memory-rules';
import { InMemoryImports, InMemorySources } from './in-memory-sources';
import { generateTestKey, signTestToken, TEST_API_CLIENT_ID, TEST_ISSUER, TEST_SPA_CLIENT_ID, TEST_TENANT, validClaims, type TestKeyPair } from './jwt';

const silent: LoggerService = { log: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined, verbose: () => undefined };

/** Users + identities + roles in memory (implements both the auth store and the users repository). */
export class InMemoryDirectory implements IdentityStore, UsersRepository {
  readonly users = new Map<string, UserView>();
  private readonly identities = new Map<string, string>();
  private next = 1000;

  private principal(user: UserView): StoredPrincipal {
    const permissions = [...new Set(ROLE_DEFINITIONS.filter((role) => user.roles.includes(role.code)).flatMap((role) => role.permissions))];
    return { userId: user.id, displayName: user.displayName, email: user.email, status: user.status, lastSeenAt: user.lastSeenAt, roles: user.roles, permissions };
  }
  async findByIdentity(provider: string, tenantId: string, subject: string): Promise<StoredPrincipal | null> {
    const id = this.identities.get(`${provider}|${tenantId}|${subject}`);
    return id ? this.principal(this.users.get(id)!) : null;
  }
  async provision(identity: VerifiedIdentity, displayName: string, now: Date, onCreated?: (principal: StoredPrincipal, tx: TransactionContext) => Promise<void>) {
    const id = uuid(this.next++);
    this.users.set(id, { id, displayName, email: identity.email ?? null, status: 'ACTIVE', roles: [], lastSeenAt: now, createdAt: now });
    this.identities.set(`${identity.provider}|${identity.tenantId}|${identity.subject}`, id);
    const principal = this.principal(this.users.get(id)!);
    await onCreated?.(principal, TX);
    return { principal, created: true };
  }
  async touch(userId: string, profile: { displayName: string; email: string | null; lastSeenAt: Date }): Promise<void> {
    Object.assign(this.users.get(userId)!, profile);
  }
  userIdOf(subject: string): string | undefined {
    return this.identities.get(`entra-id|${TEST_TENANT}|${subject}`);
  }
  async list(_filter: UserFilter, page: PageRequest): Promise<Page<UserView>> {
    const all = [...this.users.values()];
    const start = (page.page - 1) * page.pageSize;
    return { items: all.slice(start, start + page.pageSize), page: page.page, pageSize: page.pageSize, totalItems: all.length };
  }
  async findById(id: string): Promise<UserView | null> {
    return this.users.get(id) ?? null;
  }
  async lockAdministration(): Promise<void> {}
  async countActiveAdmins(excludingUserId: string): Promise<number> {
    return [...this.users.values()].filter((u) => u.id !== excludingUserId && u.status === 'ACTIVE' && u.roles.includes('ADMIN')).length;
  }
  async setStatus(id: string, status: UserStatus): Promise<void> {
    this.users.get(id)!.status = status;
  }
  async replaceRoles(id: string, roles: string[]): Promise<void> {
    this.users.get(id)!.roles = roles;
  }
  async listRoles(): Promise<RoleView[]> {
    return ROLE_DEFINITIONS.map((role) => ({ code: role.code, name: role.name, description: role.description, permissions: [...role.permissions] }));
  }
}

export class InMemoryNotifications implements NotificationPublisher, NotificationsRepository {
  readonly items: Array<NotificationView & { userId: string }> = [];
  private next = 3000;
  async notify(input: NotificationInput): Promise<void> {
    this.items.push({
      id: uuid(this.next++), userId: input.userId, type: input.type, title: input.title, message: input.message,
      entityType: input.entityType ?? null, entityId: input.entityId ?? null, readAt: null, createdAt: new Date(),
    });
  }
  async list(userId: string, unreadOnly: boolean, page: PageRequest): Promise<Page<NotificationView>> {
    const items = this.items.filter((n) => n.userId === userId && (!unreadOnly || n.readAt === null)).map(({ userId: _owner, ...view }) => view);
    return { items, page: page.page, pageSize: page.pageSize, totalItems: items.length };
  }
  async markRead(userId: string, id: string, readAt: Date): Promise<NotificationView | null> {
    const found = this.items.find((n) => n.id === id && n.userId === userId);
    if (!found) return null;
    found.readAt ??= readAt;
    const { userId: _owner, ...view } = found;
    return view;
  }
  async markAllRead(userId: string, readAt: Date): Promise<number> {
    const unread = this.items.filter((n) => n.userId === userId && n.readAt === null);
    unread.forEach((n) => (n.readAt = readAt));
    return unread.length;
  }
}

export class InMemoryAuditTrail implements AuditRecorder, AuditEventsRepository {
  readonly events: AuditEventView[] = [];
  private next = 4000;
  async record(entry: AuditEntry, _tx?: TransactionContext): Promise<void> {
    this.events.push({
      id: uuid(this.next++), occurredAt: new Date(), actorUserId: entry.actorUserId ?? null, action: entry.action, entityType: entry.entityType,
      entityId: entry.entityId ?? null, outcome: entry.outcome, requestId: null, ipAddress: null, details: entry.details ?? null,
    });
  }
  async list(_filter: unknown, page: PageRequest): Promise<Page<AuditEventView>> {
    return { items: [...this.events].reverse(), page: page.page, pageSize: page.pageSize, totalItems: this.events.length };
  }
}

/** Execution inputs read from the same in-memory imports the HTTP upload flow writes (like the shared database). */
export class ImportBackedExecutionData extends InMemoryExecutionData {
  constructor(private readonly importsRepository: InMemoryImports) {
    super();
  }
  override async latestValidatedImport(sourceId: string) {
    const validated = [...this.importsRepository.imports.values()].filter((item) => item.sourceId === sourceId && item.status === 'VALIDATED');
    const latest = validated[validated.length - 1];
    return latest ? { id: latest.id, sourceId, status: latest.status } : null;
  }
  override async findImport(importId: string) {
    const found = this.importsRepository.imports.get(importId);
    return found ? { id: found.id, sourceId: found.sourceId, status: found.status } : null;
  }
  override async loadImportDataset(importId: string) {
    const found = this.importsRepository.imports.get(importId)!;
    return { columns: (found.columns ?? []).map((column) => column.name), rows: this.importsRepository.rows.get(importId) ?? [] };
  }
}

/** Reports written by the in-memory execution data store. */
export class InMemoryReports implements ReportsRepository {
  /** When set, streamRows fails after yielding this many chunks (simulates a database error mid-export). */
  failAfterChunks: number | null = null;
  constructor(private readonly data: InMemoryExecutionData, private readonly executions: InMemoryExecutions) {}
  private view(index: number): ReportView {
    const report = this.data.reports[index];
    const execution = this.executions.executions.get(report.executionId)!;
    return {
      id: report.id, executionId: report.executionId, sourceId: execution.sourceId, name: report.name, columns: report.dataset.columns,
      rowCount: report.dataset.rows.length, createdAt: new Date(), availableAt: new Date(),
      execution: {
        phase: execution.phase, requestedById: execution.requestedById, engineVersion: execution.engineVersion, reproducedFromId: execution.reproducedFromId,
        primaryImportId: execution.inputSnapshot.primaryImportId, rules: execution.inputSnapshot.rules,
      },
    };
  }
  async list(_filter: unknown, page: PageRequest): Promise<Page<ReportView>> {
    const items = this.data.reports.map((_r, index) => this.view(index));
    return { items, page: page.page, pageSize: page.pageSize, totalItems: items.length };
  }
  async findById(id: string): Promise<ReportView | null> {
    const index = this.data.reports.findIndex((r) => r.id === id);
    return index >= 0 ? this.view(index) : null;
  }
  async readRows(id: string, page: PageRequest): Promise<Row[]> {
    const start = (page.page - 1) * page.pageSize;
    return (this.data.reports.find((r) => r.id === id)?.dataset.rows ?? []).slice(start, start + page.pageSize);
  }
  async *streamRows(id: string): AsyncIterable<Row[]> {
    const rows = this.data.reports.find((r) => r.id === id)?.dataset.rows ?? [];
    let yielded = 0;
    for (let start = 0; start < rows.length; start += 2) {
      if (this.failAfterChunks !== null && yielded >= this.failAfterChunks) throw new Error('falha simulada de leitura');
      yield rows.slice(start, start + 2);
      yielded += 1;
    }
    // Failure while fetching the next chunk (also after the last one: the reader cannot know it was the last).
    if (this.failAfterChunks !== null) throw new Error('falha simulada de leitura');
  }
}

export interface E2eContext {
  app: NestExpressApplication;
  baseUrl: string;
  config: AppConfig;
  key: TestKeyPair;
  directory: InMemoryDirectory;
  sources: InMemorySources;
  imports: InMemoryImports;
  rules: InMemoryRules;
  executions: InMemoryExecutions;
  data: InMemoryExecutionData;
  notifications: InMemoryNotifications;
  reports: InMemoryReports;
  audit: InMemoryAuditTrail;
  jobs: FakeJobs;
  database: { up: boolean };
  /** Signs an access token for the subject (oid) with the test key, optionally overriding claims. */
  token(subject: string, overrides?: Record<string, unknown>): string;
  /** Grants roles to the local user of `subject` (signing in first if needed). */
  grant(subject: string, roles: string[]): Promise<string>;
  request(method: string, path: string, options?: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string | FormData | Blob | Uint8Array }): Promise<Response>;
  close(): Promise<void>;
}

export async function createE2eApp(env: Record<string, string> = {}): Promise<E2eContext> {
  const config = loadAppConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://sandbox:unused@localhost:1/unused',
    ENTRA_TENANT_ID: TEST_TENANT,
    ENTRA_API_CLIENT_ID: TEST_API_CLIENT_ID,
    ENTRA_ALLOWED_CLIENT_IDS: TEST_SPA_CLIENT_ID,
    CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
    IMPORT_MAX_FILE_BYTES: '65536',
    // The readiness test toggles the database state between consecutive calls.
    HEALTH_READY_CACHE_MS: '0',
    LOG_LEVEL: 'error',
    ...env,
  });
  const key = generateTestKey('e2e-key');
  const directory = new InMemoryDirectory();
  const sources = new InMemorySources();
  const imports = new InMemoryImports();
  const rules = new InMemoryRules();
  const executions = new InMemoryExecutions();
  const data = new ImportBackedExecutionData(imports);
  const notifications = new InMemoryNotifications();
  const audit = new InMemoryAuditTrail();
  const jobs = new FakeJobs();
  const reports = new InMemoryReports(data, executions);
  const database = { up: true };
  const prisma = {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $queryRaw: async () => {
      if (!database.up) throw new Error('database down');
      return [{ '?column?': 1 }];
    },
  };
  const verifier = new EntraTokenVerifier(
    new AccessTokenVerifier(
      { issuer: TEST_ISSUER, audiences: config.entra.audiences, tenantId: TEST_TENANT, requiredScope: 'access_as_user', allowedClientIds: config.entra.allowedClientIds },
      { getSigningKey: async (kid) => (kid === 'e2e-key' ? key.publicKey : null) },
    ),
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(PrismaService).useValue(prisma)
    .overrideProvider(TOKENS.TRANSACTION_RUNNER).useValue(new FakeTransactions())
    .overrideProvider(TOKENS.AUDIT_RECORDER).useValue(audit)
    .overrideProvider(TOKENS.NOTIFICATION_PUBLISHER).useValue(notifications)
    .overrideProvider(TOKENS.JOB_QUEUE).useValue(jobs)
    .overrideProvider(AUTH_TOKENS.TOKEN_VERIFIER).useValue(verifier)
    .overrideProvider(AUTH_TOKENS.IDENTITY_STORE).useValue(directory)
    .overrideProvider(USERS_REPOSITORY).useValue(directory)
    .overrideProvider(SOURCES_TOKENS.SOURCES_REPOSITORY).useValue(sources)
    .overrideProvider(SOURCES_TOKENS.IMPORTS_REPOSITORY).useValue(imports)
    .overrideProvider(RULES_REPOSITORY).useValue(rules)
    .overrideProvider(EXECUTIONS_TOKENS.EXECUTIONS_REPOSITORY).useValue(executions)
    .overrideProvider(EXECUTIONS_TOKENS.EXECUTION_DATA_STORE).useValue(data)
    .overrideProvider(REPORTS_TOKENS.REPORTS_REPOSITORY).useValue(reports)
    .overrideProvider(NOTIFICATIONS_REPOSITORY).useValue(notifications)
    .overrideProvider(AUDIT_EVENTS_REPOSITORY).useValue(audit)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: silent });
  configureHttpApplication(app, config, silent);
  await app.listen(0, '127.0.0.1');
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const token = (subject: string, overrides: Record<string, unknown> = {}) =>
    signTestToken(key, { ...validClaims(Math.floor(Date.now() / 1000)), oid: subject, name: `Pessoa ${subject.slice(-4)}`, ...overrides });
  const request: E2eContext['request'] = (method, path, options = {}) => {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    let body: string | FormData | Blob | Uint8Array | undefined = options.raw;
    if (options.body !== undefined) {
      headers['content-type'] ??= 'application/json';
      body = JSON.stringify(options.body);
    }
    return fetch(`${baseUrl}/api/v1${path}`, { method, headers, body });
  };
  const grant = async (subject: string, roles: string[]) => {
    if (!directory.userIdOf(subject)) await request('GET', '/auth/me', { token: token(subject) });
    const id = directory.userIdOf(subject)!;
    directory.users.get(id)!.roles = roles;
    return id;
  };
  return {
    app, baseUrl, config, key, directory, sources, imports, rules, executions, data, notifications, reports, audit, jobs, database, token, grant, request,
    close: () => app.close(),
  };
}
