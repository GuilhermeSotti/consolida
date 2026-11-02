/**
 * Idempotent seed of the access-control catalog (permissions, roles and their grants), derived
 * from src/modules/auth/domain/access-control.ts. It never creates users and never deletes
 * permissions (obsolete codes are only reported). Safe to run on every deployment.
 *
 *   npm run build:api && npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { loadLocalEnvFile } from '../config/env-file';
import { PERMISSION_DESCRIPTIONS, ROLE_DEFINITIONS } from '../modules/auth/domain/access-control';

async function main(): Promise<void> {
  loadLocalEnvFile();
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      for (const [code, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
        await tx.permission.upsert({ where: { code }, create: { code, description }, update: { description } });
      }
      for (const role of ROLE_DEFINITIONS) {
        const saved = await tx.role.upsert({
          where: { code: role.code },
          create: { code: role.code, name: role.name, description: role.description },
          update: { name: role.name, description: role.description },
        });
        const permissions = await tx.permission.findMany({ where: { code: { in: [...role.permissions] } }, select: { id: true } });
        await tx.rolePermission.deleteMany({ where: { roleId: saved.id, permissionId: { notIn: permissions.map((permission) => permission.id) } } });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: saved.id, permissionId: permission.id })),
          skipDuplicates: true,
        });
      }
    });
    const known = new Set(Object.keys(PERMISSION_DESCRIPTIONS));
    const obsolete = (await prisma.permission.findMany({ select: { code: true } })).filter((permission) => !known.has(permission.code));
    console.log(
      JSON.stringify({
        event: 'seed_completed',
        permissions: known.size,
        roles: ROLE_DEFINITIONS.length,
        obsoletePermissions: obsolete.map((permission) => permission.code),
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: 'seed_failed', error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
