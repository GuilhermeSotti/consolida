/**
 * Public configuration baked at build time (NEXT_PUBLIC_*). These are identifiers, not secrets:
 * the SPA uses Authorization Code + PKCE with no client secret.
 */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável ${name} não configurada no build do frontend.`);
  return value;
}

export const appConfig = {
  apiBaseUrl: required('NEXT_PUBLIC_API_BASE_URL', process.env.NEXT_PUBLIC_API_BASE_URL).replace(/\/+$/, ''),
  tenantId: required('NEXT_PUBLIC_ENTRA_TENANT_ID', process.env.NEXT_PUBLIC_ENTRA_TENANT_ID),
  clientId: required('NEXT_PUBLIC_ENTRA_CLIENT_ID', process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID),
  /** Delegated scope of the API registration, e.g. api://<api-client-id>/access_as_user */
  apiScope: required('NEXT_PUBLIC_API_SCOPE', process.env.NEXT_PUBLIC_API_SCOPE),
};
