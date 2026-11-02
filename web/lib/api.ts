import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { appConfig } from './config';
import { getMsal, loginRequest } from './msal';
import type { ErrorDetail, Page, PageMetadata } from './types';

/** Error returned by the API envelope (`{ success: false, error }`) or by the network. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
}

/** Access token for the API (silent; falls back to a redirect when interaction is required). */
async function accessToken(): Promise<string> {
  const msal = getMsal();
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
  if (!account) {
    await msal.loginRedirect(loginRequest);
    throw new ApiError(401, 'LOGIN_REQUIRED', 'Redirecionando para o login corporativo…');
  }
  try {
    const result = await msal.acquireTokenSilent({ ...loginRequest, account });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect({ ...loginRequest, account });
      throw new ApiError(401, 'LOGIN_REQUIRED', 'Sessão expirada. Redirecionando para o login…');
    }
    throw error;
  }
}

function url(path: string, query?: Query): string {
  const target = new URL(`${appConfig.apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value));
  }
  return target.toString();
}

async function send(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${await accessToken()}`, ...options.headers };
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(url(path, options.query), { method, headers, body, cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível contatar a API. Verifique sua conexão.');
  }
  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; details?: ErrorDetail[]; requestId?: string } } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Non-JSON error (proxy, gateway): fall back to the status text.
    }
    throw new ApiError(
      response.status,
      payload.error?.code ?? `HTTP_${response.status}`,
      payload.error?.message ?? response.statusText ?? 'Erro na requisição.',
      payload.error?.details ?? [],
      payload.error?.requestId ?? response.headers.get('x-request-id') ?? undefined,
    );
  }
  return response;
}

async function json<T>(method: string, path: string, options?: RequestOptions): Promise<{ data: T; metadata?: PageMetadata }> {
  const response = await send(method, path, options);
  return (await response.json()) as { data: T; metadata?: PageMetadata };
}

export const api = {
  async get<T>(path: string, query?: Query): Promise<T> {
    return (await json<T>('GET', path, { query })).data;
  },
  async page<T>(path: string, query?: Query): Promise<Page<T>> {
    const result = await json<T[]>('GET', path, { query });
    return { items: result.data, metadata: result.metadata ?? { page: 1, pageSize: result.data.length, totalItems: result.data.length, totalPages: 1 } };
  },
  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return (await json<T>('POST', path, { body, headers })).data;
  },
  async patch<T>(path: string, body: unknown): Promise<T> {
    return (await json<T>('PATCH', path, { body })).data;
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    return (await json<T>('PUT', path, { body })).data;
  },
  async upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData();
    form.append('file', file, file.name);
    return (await json<T>('POST', path, { form })).data;
  },
  /** Downloads a file response and hands it to the browser as an attachment. */
  async download(path: string, query?: Query): Promise<void> {
    const response = await send('GET', path, { query, headers: { Accept: '*/*' } });
    const disposition = response.headers.get('content-disposition') ?? '';
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download';
    let blob: Blob;
    try {
      blob = await response.blob();
    } catch {
      // The API aborts the connection when the export fails midway: never save a partial file.
      throw new ApiError(0, 'DOWNLOAD_INTERRUPTED', 'O download foi interrompido antes do fim. Tente novamente.');
    }
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  },
};

/** New random key per user action (idempotent retries of the same action reuse it). */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
