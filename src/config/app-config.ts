/**
 * Typed application configuration, validated once at startup from environment variables.
 * Invalid or missing values abort the process with the list of offending variable NAMES
 * (values are never printed, as they may be secrets). No authentication shortcut exists:
 * every environment, including development, validates Entra ID tokens.
 */
export type NodeEnvironment = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface EntraConfig {
  tenantId: string;
  /** Application (client) ID of the API registration. */
  apiClientId: string;
  /** Accepted `aud` values (the API client ID and its Application ID URI). */
  audiences: string[];
  /** Delegated scope that every access token must carry (e.g. `access_as_user`). */
  requiredScope: string;
  /** Client applications allowed to call the API (`azp`), e.g. the SPA registration. */
  allowedClientIds: string[];
  issuer: string;
  jwksUri: string;
}

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  logLevel: LogLevel;
  databaseUrl: string;
  /** Exact origins allowed by CORS (no wildcard). */
  corsAllowedOrigins: string[];
  /** Express `trust proxy` (number of proxy hops in front of the API). */
  trustProxyHops: number;
  rateLimit: { ttlSeconds: number; limit: number };
  entra: EntraConfig;
  imports: { maxFileBytes: number; maxRows: number; maxColumns: number };
  executions: { maxRows: number };
  /** XLSX is built in memory inside the request: bounded by cells (rows × columns). CSV streams. */
  reports: { xlsxMaxCells: number };
  /** Readiness probe: the database check result is reused for this long. */
  health: { readyCacheMs: number };
  worker: {
    id: string;
    pollIntervalMs: number;
    leaseSeconds: number;
    shutdownGraceMs: number;
    /** File touched whenever the worker makes progress (exec liveness probe, e.g. Docker Compose). */
    heartbeatFile: string | null;
    /** Port of the worker's HTTP liveness endpoint (platforms without exec probes, e.g. Container Apps). */
    healthPort: number | null;
  };
}

export class ConfigValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuração inválida: ${problems.join('; ')}`);
    this.name = 'ConfigValidationError';
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loadAppConfig(env: Readonly<Record<string, string | undefined>>, defaults: { workerId?: string } = {}): AppConfig {
  const problems: string[] = [];
  const read = (name: string): string | undefined => {
    const value = env[name];
    return value === undefined || value.trim() === '' ? undefined : value.trim();
  };
  const required = (name: string): string => {
    const value = read(name);
    if (value === undefined) problems.push(`${name} é obrigatória`);
    return value ?? '';
  };
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = read(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      problems.push(`${name} deve ser um inteiro entre ${min} e ${max}`);
      return fallback;
    }
    return value;
  };
  const list = (name: string): string[] =>
    (read(name) ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const raw = read(name);
    if (raw === undefined) return fallback;
    if (!(allowed as readonly string[]).includes(raw)) {
      problems.push(`${name} deve ser um de: ${allowed.join(', ')}`);
      return fallback;
    }
    return raw as T;
  };

  const nodeEnv = oneOf<NodeEnvironment>('NODE_ENV', ['development', 'test', 'production'], 'development');
  const production = nodeEnv === 'production';

  const databaseUrl = required('DATABASE_URL');
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push('DATABASE_URL deve usar o esquema postgresql://');

  const corsAllowedOrigins = list('CORS_ALLOWED_ORIGINS');
  for (const origin of corsAllowedOrigins) {
    let valid = false;
    try {
      const url = new URL(origin);
      valid = url.origin === origin && (url.protocol === 'https:' || (!production && url.protocol === 'http:'));
    } catch {
      valid = false;
    }
    if (!valid) problems.push(`CORS_ALLOWED_ORIGINS contém uma origem inválida (use esquema://host[:porta]${production ? ' com https' : ''})`);
  }
  if (production && corsAllowedOrigins.length === 0) problems.push('CORS_ALLOWED_ORIGINS é obrigatória em produção');

  const tenantId = required('ENTRA_TENANT_ID');
  if (tenantId && !GUID.test(tenantId)) problems.push('ENTRA_TENANT_ID deve ser o GUID do tenant (não use "common" ou "organizations")');
  const apiClientId = required('ENTRA_API_CLIENT_ID');
  if (apiClientId && !GUID.test(apiClientId)) problems.push('ENTRA_API_CLIENT_ID deve ser um GUID');
  const audiences = [...new Set([apiClientId, read('ENTRA_API_AUDIENCE') ?? (apiClientId ? `api://${apiClientId}` : '')].filter(Boolean))];
  const requiredScope = read('ENTRA_REQUIRED_SCOPE') ?? 'access_as_user';
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(requiredScope)) problems.push('ENTRA_REQUIRED_SCOPE inválido');
  const allowedClientIds = list('ENTRA_ALLOWED_CLIENT_IDS');
  if (allowedClientIds.some((id) => !GUID.test(id))) problems.push('ENTRA_ALLOWED_CLIENT_IDS deve conter GUIDs separados por vírgula');
  if (production && allowedClientIds.length === 0) problems.push('ENTRA_ALLOWED_CLIENT_IDS é obrigatória em produção');
  const authorityHost = (read('ENTRA_AUTHORITY_HOST') ?? 'https://login.microsoftonline.com').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(authorityHost)) problems.push('ENTRA_AUTHORITY_HOST deve ser uma URL https sem caminho');

  const config: AppConfig = {
    nodeEnv,
    port: integer('PORT', 3000, 1, 65535),
    logLevel: oneOf<LogLevel>('LOG_LEVEL', ['debug', 'info', 'warn', 'error'], production ? 'info' : 'debug'),
    databaseUrl,
    corsAllowedOrigins,
    trustProxyHops: integer('TRUST_PROXY_HOPS', 0, 0, 10),
    rateLimit: {
      ttlSeconds: integer('RATE_LIMIT_TTL_SECONDS', 60, 1, 3600),
      limit: integer('RATE_LIMIT_MAX_REQUESTS', 300, 1, 100_000),
    },
    entra: {
      tenantId: tenantId.toLowerCase(),
      apiClientId: apiClientId.toLowerCase(),
      audiences,
      requiredScope,
      allowedClientIds: allowedClientIds.map((id) => id.toLowerCase()),
      issuer: `${authorityHost}/${tenantId.toLowerCase()}/v2.0`,
      jwksUri: `${authorityHost}/${tenantId.toLowerCase()}/discovery/v2.0/keys`,
    },
    imports: {
      maxFileBytes: integer('IMPORT_MAX_FILE_BYTES', 20 * 1024 * 1024, 1024, 200 * 1024 * 1024),
      maxRows: integer('IMPORT_MAX_ROWS', 200_000, 1, 5_000_000),
      maxColumns: integer('IMPORT_MAX_COLUMNS', 500, 1, 5_000),
    },
    executions: { maxRows: integer('EXECUTION_MAX_ROWS', 500_000, 1, 10_000_000) },
    reports: { xlsxMaxCells: integer('REPORT_XLSX_MAX_CELLS', 200_000, 1_000, 5_000_000) },
    health: { readyCacheMs: integer('HEALTH_READY_CACHE_MS', 2_000, 0, 60_000) },
    worker: {
      id: read('WORKER_ID') ?? defaults.workerId ?? 'worker',
      pollIntervalMs: integer('WORKER_POLL_INTERVAL_MS', 2000, 100, 60_000),
      leaseSeconds: integer('WORKER_JOB_LEASE_SECONDS', 300, 30, 86_400),
      shutdownGraceMs: integer('WORKER_SHUTDOWN_GRACE_MS', 30_000, 0, 600_000),
      heartbeatFile: read('WORKER_HEARTBEAT_FILE') ?? null,
      healthPort: read('WORKER_HEALTH_PORT') === undefined ? null : integer('WORKER_HEALTH_PORT', 0, 1, 65535),
    },
  };
  if (problems.length > 0) throw new ConfigValidationError(problems);
  return config;
}
