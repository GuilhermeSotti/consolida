/**
 * Operational CLI to grant a role to a user that already signed in once (first administrator
 * bootstrap, or recovery when no administrator is left). It runs with database access only —
 * there is no HTTP shortcut — and writes an audit event.
 *
 *   npm run admin:grant-role -- --tenant-id <tid> --object-id <oid> --role ADMIN
 *   npm run admin:grant-role -- --user-id <uuid> --role BUSINESS_ANALYST
 */
import { PrismaClient } from '@prisma/client';
import { userInfo } from 'node:os';
import { loadLocalEnvFile } from '../config/env-file';
import { isRoleCode } from '../modules/auth/domain/access-control';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  loadLocalEnvFile();
  const role = argument('role');
  const userId = argument('user-id');
  const tenantId = argument('tenant-id');
  const objectId = argument('object-id');
  if (!role || !isRoleCode(role)) throw new Error('Informe --role com um papel válido (ADMIN, FUNCTIONAL_ADMIN, BUSINESS_ANALYST, OPERATIONS, MANAGER, VIEWER).');
  if (!(userId && GUID.test(userId)) && !(tenantId && objectId && GUID.test(tenantId) && GUID.test(objectId))) {
    throw new Error('Informe --user-id <uuid> ou --tenant-id <guid> --object-id <guid>.');
  }

  const prisma = new PrismaClient();
  try {
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId.toLowerCase() }, select: { id: true } })
      : (
          await prisma.externalIdentity.findUnique({
            where: { provider_tenantId_subject: { provider: 'entra-id', tenantId: tenantId!.toLowerCase(), subject: objectId!.toLowerCase() } },
            select: { user: { select: { id: true } } },
          })
        )?.user ?? null;
    if (!user) throw new Error('Usuário não encontrado. Ele precisa acessar o ConsolidaHub uma vez antes de receber papéis.');
    const roleRow = await prisma.role.findUnique({ where: { code: role }, select: { id: true } });
    if (!roleRow) throw new Error('Papel não cadastrado. Execute o seed (npm run db:seed) antes.');

    await prisma.$transaction(async (tx) => {
      await tx.userRole.createMany({ data: [{ userId: user.id, roleId: roleRow.id }], skipDuplicates: true });
      await tx.auditEvent.create({
        data: {
          action: 'USER_ROLE_GRANTED_CLI',
          entityType: 'User',
          entityId: user.id,
          outcome: 'SUCCESS',
          actorUserId: null,
          details: { role, operator: userInfo().username },
        },
      });
    });
    const roles = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { code: true } } } });
    console.log(JSON.stringify({ event: 'role_granted', userId: user.id, roles: roles.map((assignment) => assignment.role.code).sort() }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: 'grant_role_failed', error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
