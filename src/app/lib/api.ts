const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

function readToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem('consolida_token');
}

export function getStoredAuthToken() {
  return readToken();
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem('consolida_token', token);
    return;
  }

  window.localStorage.removeItem('consolida_token');
}

export function clearAuthToken() {
  setAuthToken(null);
}

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  const token = readToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

async function parseBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(init),
    credentials: 'include',
  });

  const payload = await parseBody<unknown>(response);

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: string }).message)
        : 'Falha ao comunicar com o backend';
    throw new Error(message);
  }

  return payload as T;
}

export async function apiGet<T>(path: string) {
  return request<T>(path, { method: 'GET' });
}

export async function apiPost<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}
