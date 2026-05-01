import { readSession, type UserRole } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';

interface ApiOptions {
  role?: UserRole;
}

function authHeaders(options: ApiOptions): HeadersInit {
  const session = readSession();
  const base: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!session) {
    throw new Error('missing_session');
  }
  if (options.role && session.role !== options.role) {
    throw new Error(`role_required:${options.role}`);
  }

  base.Authorization = `Bearer ${session.token}`;
  return base;
}

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  body?: unknown,
  options: ApiOptions = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders(options),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: method === 'GET' ? 'no-store' : undefined
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`${method} ${path} failed: ${response.status} ${payload}`);
  }
  return (await response.json()) as T;
}

export async function apiLogin(staffId: string, password: string): Promise<{ token: string; role: UserRole }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, password })
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`login_failed:${response.status}:${payload}`);
  }
  return (await response.json()) as { token: string; role: UserRole };
}

export function apiGet<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return request<T>(path, 'GET', undefined, options);
}

export function apiPost<T>(path: string, body: unknown, options: ApiOptions = {}): Promise<T> {
  return request<T>(path, 'POST', body, options);
}

export function apiPatch<T>(path: string, body: unknown, options: ApiOptions = {}): Promise<T> {
  return request<T>(path, 'PATCH', body, options);
}

export function apiPut<T>(path: string, body: unknown, options: ApiOptions = {}): Promise<T> {
  return request<T>(path, 'PUT', body, options);
}
