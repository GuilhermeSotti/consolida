/**
 * Access-control catalog (single source of truth for the seed, guards and documentation).
 *
 * Roles come from the decisions recorded in Passo 7 (ENTRA_ID_SETUP.md): roles are managed
 * locally in ConsolidaHub and are NOT synchronized from Entra ID. Permissions follow the
 * `resource:action` format. The role → permission matrix is a proposal that requires business
 * confirmation (docs/arquitetura/seguranca.md).
 */
export const PERMISSIONS = {
  RULES_VIEW: 'rules:view',
  RULES_CREATE: 'rules:create',
  RULES_UPDATE: 'rules:update',
  RULES_ACTIVATE: 'rules:activate',
  SOURCES_VIEW: 'sources:view',
  SOURCES_CREATE: 'sources:create',
  SOURCES_UPDATE: 'sources:update',
  SOURCES_IMPORT: 'sources:import',
  EXECUTIONS_VIEW: 'executions:view',
  EXECUTIONS_RUN: 'executions:run',
  EXECUTIONS_CANCEL: 'executions:cancel',
  REPORTS_VIEW: 'reports:view',
  REPORTS_EXPORT: 'reports:export',
  USERS_VIEW: 'users:view',
  USERS_MANAGE: 'users:manage',
  AUDIT_VIEW: 'audit:view',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Readonly<Record<PermissionCode, string>> = {
  'rules:view': 'Consultar regras e versões',
  'rules:create': 'Criar regras',
  'rules:update': 'Alterar regras (gera nova versão)',
  'rules:activate': 'Ativar e desativar regras',
  'sources:view': 'Consultar bases de entrada e cargas',
  'sources:create': 'Cadastrar bases de entrada',
  'sources:update': 'Alterar, ativar e desativar bases de entrada',
  'sources:import': 'Enviar cargas de dados',
  'executions:view': 'Consultar execuções e logs',
  'executions:run': 'Executar e reprocessar consolidações',
  'executions:cancel': 'Cancelar execuções',
  'reports:view': 'Consultar o Relatório Consolidado',
  'reports:export': 'Exportar o Relatório Consolidado',
  'users:view': 'Consultar usuários e papéis',
  'users:manage': 'Ativar/desativar usuários e atribuir papéis',
  'audit:view': 'Consultar a trilha de auditoria',
};

export const ROLES = {
  ADMIN: 'ADMIN',
  FUNCTIONAL_ADMIN: 'FUNCTIONAL_ADMIN',
  BUSINESS_ANALYST: 'BUSINESS_ANALYST',
  OPERATIONS: 'OPERATIONS',
  MANAGER: 'MANAGER',
  VIEWER: 'VIEWER',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionCode[];
const P = PERMISSIONS;

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  description: string;
  permissions: readonly PermissionCode[];
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    code: 'ADMIN',
    name: 'Administrador',
    description: 'Acesso total à plataforma.',
    permissions: ALL_PERMISSIONS,
  },
  {
    code: 'FUNCTIONAL_ADMIN',
    name: 'Administrador funcional',
    description: 'Administra usuários, papéis e acompanha a trilha de auditoria.',
    permissions: [P.USERS_VIEW, P.USERS_MANAGE, P.AUDIT_VIEW, P.RULES_VIEW, P.SOURCES_VIEW, P.EXECUTIONS_VIEW, P.REPORTS_VIEW],
  },
  {
    code: 'BUSINESS_ANALYST',
    name: 'Analista de negócio',
    description: 'Cadastra e versiona regras, executa e valida resultados.',
    permissions: [
      P.RULES_VIEW,
      P.RULES_CREATE,
      P.RULES_UPDATE,
      P.RULES_ACTIVATE,
      P.SOURCES_VIEW,
      P.EXECUTIONS_VIEW,
      P.EXECUTIONS_RUN,
      P.REPORTS_VIEW,
      P.REPORTS_EXPORT,
    ],
  },
  {
    code: 'OPERATIONS',
    name: 'Operações / backoffice',
    description: 'Registra bases, envia cargas e monitora o processamento.',
    permissions: [
      P.SOURCES_VIEW,
      P.SOURCES_CREATE,
      P.SOURCES_UPDATE,
      P.SOURCES_IMPORT,
      P.EXECUTIONS_VIEW,
      P.EXECUTIONS_RUN,
      P.EXECUTIONS_CANCEL,
      P.RULES_VIEW,
      P.REPORTS_VIEW,
    ],
  },
  {
    code: 'MANAGER',
    name: 'Gestor',
    description: 'Consulta e exporta resultados consolidados e o status das cargas.',
    permissions: [P.REPORTS_VIEW, P.REPORTS_EXPORT, P.EXECUTIONS_VIEW, P.SOURCES_VIEW, P.RULES_VIEW],
  },
  {
    code: 'VIEWER',
    name: 'Consulta',
    description: 'Somente leitura.',
    permissions: [P.REPORTS_VIEW, P.EXECUTIONS_VIEW, P.SOURCES_VIEW, P.RULES_VIEW],
  },
];

export function isPermissionCode(value: string): value is PermissionCode {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_DEFINITIONS.some((role) => role.code === value);
}

/** Authenticated caller as seen by the application layer. */
export interface Principal {
  userId: string;
  displayName: string;
  email: string | null;
  roles: string[];
  permissions: string[];
}

export function hasAllPermissions(principal: Pick<Principal, 'permissions'>, required: readonly string[]): boolean {
  return required.every((permission) => principal.permissions.includes(permission));
}
