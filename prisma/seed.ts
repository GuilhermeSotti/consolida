import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default roles
  const adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: {
      code: 'ADMIN',
      name: 'Administrator',
      description: 'Full system access',
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { code: 'MANAGER' },
    update: {},
    create: {
      code: 'MANAGER',
      name: 'Manager',
      description: 'Can manage rules, sources, and view reports',
    },
  });

  const userRole = await prisma.role.upsert({
    where: { code: 'USER' },
    update: {},
    create: {
      code: 'USER',
      name: 'User',
      description: 'Can view reports and execute rules',
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { code: 'VIEWER' },
    update: {},
    create: {
      code: 'VIEWER',
      name: 'Viewer',
      description: 'Read-only access to reports',
    },
  });

  console.log('✅ Created roles:', {
    admin: adminRole.code,
    manager: managerRole.code,
    user: userRole.code,
    viewer: viewerRole.code,
  });

  // Create default permissions
  const permissions = [
    // Rule permissions
    { code: 'RULE_CREATE', name: 'Create Rules' },
    { code: 'RULE_READ', name: 'Read Rules' },
    { code: 'RULE_UPDATE', name: 'Update Rules' },
    { code: 'RULE_DELETE', name: 'Delete Rules' },
    { code: 'RULE_EXECUTE', name: 'Execute Rules' },

    // Source permissions
    { code: 'SOURCE_CREATE', name: 'Create Sources' },
    { code: 'SOURCE_READ', name: 'Read Sources' },
    { code: 'SOURCE_UPDATE', name: 'Update Sources' },
    { code: 'SOURCE_DELETE', name: 'Delete Sources' },

    // Execution permissions
    { code: 'EXECUTION_READ', name: 'Read Executions' },
    { code: 'EXECUTION_CANCEL', name: 'Cancel Executions' },

    // Report permissions
    { code: 'REPORT_CREATE', name: 'Create Reports' },
    { code: 'REPORT_READ', name: 'Read Reports' },
    { code: 'REPORT_EXPORT', name: 'Export Reports' },

    // User management
    { code: 'USER_READ', name: 'Read Users' },
    { code: 'USER_MANAGE', name: 'Manage Users' },
  ];

  const createdPermissions = [];
  for (const perm of permissions) {
    const created = await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
    createdPermissions.push(created);
  }

  console.log(`✅ Created ${createdPermissions.length} permissions`);

  // Assign permissions to roles
  // Admin gets all permissions
  for (const perm of createdPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Manager gets most permissions except user management and delete
  const managerPerms = createdPermissions.filter(
    (p) =>
      ![
        'RULE_DELETE',
        'SOURCE_DELETE',
        'USER_READ',
        'USER_MANAGE',
      ].includes(p.code),
  );
  for (const perm of managerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: managerRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: managerRole.id,
        permissionId: perm.id,
      },
    });
  }

  // User gets read and execute permissions
  const userPerms = createdPermissions.filter((p) =>
    [
      'RULE_READ',
      'RULE_EXECUTE',
      'SOURCE_READ',
      'EXECUTION_READ',
      'REPORT_READ',
    ].includes(p.code),
  );
  for (const perm of userPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: userRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: userRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Viewer gets only report read
  const viewerPerms = createdPermissions.filter((p) =>
    ['REPORT_READ'].includes(p.code),
  );
  for (const perm of viewerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: viewerRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: viewerRole.id,
        permissionId: perm.id,
      },
    });
  }

  console.log('✅ Assigned permissions to roles');

  console.log('🎉 Database seeded successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
