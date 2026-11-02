import { ConfigValidationError, loadAppConfig } from '../../../src/config/app-config';

const TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';
const API = '11111111-2222-4333-8444-555555555555';
const SPA = '66666666-7777-4888-8999-000000000000';

const base = {
  DATABASE_URL: 'postgresql://app:secret@localhost:5432/consolidahub',
  ENTRA_TENANT_ID: TENANT,
  ENTRA_API_CLIENT_ID: API,
};

function problems(env: Record<string, string>): string[] {
  try {
    loadAppConfig(env);
  } catch (error) {
    if (error instanceof ConfigValidationError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadAppConfig', () => {
  it('derives the Entra issuer, JWKS and audiences from the tenant and API ids', () => {
    const config = loadAppConfig({ ...base, CORS_ALLOWED_ORIGINS: 'http://localhost:3001' });
    expect(config.entra).toEqual({
      tenantId: TENANT,
      apiClientId: API,
      audiences: [API, `api://${API}`],
      requiredScope: 'access_as_user',
      allowedClientIds: [],
      issuer: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      jwksUri: `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`,
    });
    expect(config.nodeEnv).toBe('development');
    expect(config.imports.maxFileBytes).toBe(20 * 1024 * 1024);
  });

  it('lists every invalid variable by name without echoing values', () => {
    const list = problems({ DATABASE_URL: 'mysql://user:topsecret@db', ENTRA_TENANT_ID: 'common', ENTRA_API_CLIENT_ID: 'x', PORT: '99999' });
    expect(list).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DATABASE_URL'),
        expect.stringContaining('ENTRA_TENANT_ID'),
        expect.stringContaining('ENTRA_API_CLIENT_ID'),
        expect.stringContaining('PORT'),
      ]),
    );
    expect(list.join(' ')).not.toContain('topsecret');
  });

  it('is stricter in production (https origins, CORS and client allow-list required)', () => {
    const list = problems({ ...base, NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'http://app.empresa.com' });
    expect(list).toEqual(
      expect.arrayContaining([expect.stringContaining('CORS_ALLOWED_ORIGINS'), expect.stringContaining('ENTRA_ALLOWED_CLIENT_IDS')]),
    );
    const ok = loadAppConfig({ ...base, NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://app.empresa.com', ENTRA_ALLOWED_CLIENT_IDS: SPA.toUpperCase() });
    expect(ok.entra.allowedClientIds).toEqual([SPA]);
    expect(ok.logLevel).toBe('info');
  });

  it('rejects origins with paths and wildcard tenants', () => {
    expect(problems({ ...base, CORS_ALLOWED_ORIGINS: 'https://app.empresa.com/path' })).toHaveLength(1);
    expect(problems({ ...base, CORS_ALLOWED_ORIGINS: '*' })).toHaveLength(1);
    expect(problems({ ...base, ENTRA_TENANT_ID: 'organizations' })).toHaveLength(1);
  });

  it('enables the worker HTTP liveness endpoint only when a valid port is configured', () => {
    expect(loadAppConfig(base).worker.healthPort).toBeNull();
    expect(loadAppConfig({ ...base, WORKER_HEALTH_PORT: '3002' }).worker.healthPort).toBe(3002);
    expect(problems({ ...base, WORKER_HEALTH_PORT: '0' })).toEqual([expect.stringContaining('WORKER_HEALTH_PORT')]);
  });
});
