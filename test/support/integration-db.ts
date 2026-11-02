/**
 * Helpers for integration tests against a REAL PostgreSQL with the migrations applied
 * (`npm run db:migrate:deploy`). Safety: refuses to run unless the database name ends with
 * `_test`, because every test file truncates all tables.
 */
import type { AppConfig } from '../../src/config/app-config';
import type { TransactionContext } from '../../src/shared/application/ports';
import { PrismaTransactionRunner } from '../../src/shared/infrastructure/prisma/prisma-transaction.runner';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { ROLE_DEFINITIONS, PERMISSION_DESCRIPTIONS } from '../../src/modules/auth/domain/access-control';

export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL apontando para um banco de teste descartável (nome terminado em _test).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) throw new Error(`Recusado: o banco "${name}" não termina com _test (os testes apagam os dados).`);
  return url;
}

export async function connect(): Promise<{ prisma: PrismaService; transactions: PrismaTransactionRunner }> {
  const prisma = new PrismaService({ databaseUrl: testDatabaseUrl() } as AppConfig);
  await prisma.onModuleInit();
  return { prisma, transactions: new PrismaTransactionRunner(prisma) };
}

const TABLES = [
  'report_chunks', 'reports', 'execution_logs', 'executions', 'import_chunks', 'import_files', 'data_imports',
  'rule_versions', 'rules', 'sources', 'notifications', 'background_jobs', 'audit_events', 'user_roles',
  'external_identities', 'users', 'role_permissions', 'permissions', 'roles',
];

/** Empties every table (TRUNCATE is not affected by the append-only row triggers) and re-seeds the RBAC catalog. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`);
  for (const [code, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await prisma.permission.create({ data: { code, description } });
  }
  for (const role of ROLE_DEFINITIONS) {
    const created = await prisma.role.create({ data: { code: role.code, name: role.name, description: role.description } });
    const permissions = await prisma.permission.findMany({ where: { code: { in: [...role.permissions] } }, select: { id: true } });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: created.id, permissionId: permission.id })) });
  }
}

export async function createUser(prisma: PrismaService, displayName = 'Pessoa Integração'): Promise<string> {
  const user = await prisma.user.create({ data: { displayName, status: 'ACTIVE' }, select: { id: true } });
  return user.id;
}

export function asTx(client: unknown): TransactionContext {
  return client as TransactionContext;
}
