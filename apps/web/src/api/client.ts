import type { ApiResponse } from "@digital-heroes/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const STORAGE_KEY = "digital-heroes.session";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

let session: StoredSession | null = loadSession();

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function setSession(next: StoredSession | null): void {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (e.g. private browsing); the in-memory value still works
    // for the current page load.
  }
}

export function getSession(): StoredSession | null {
  return session;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!session?.refreshToken) return false;
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const body = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken: string }>;
  if (!res.ok || !body.success) {
    setSession(null);
    return false;
  }
  setSession({ accessToken: body.data.accessToken, refreshToken: body.data.refreshToken });
  return true;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false && session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !isRetry && options.auth !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, true);
  }

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new ApiClientError(body.error.code, body.error.message, res.status, body.error.details);
  }
  return body.data;
}

/** For multipart file uploads (e.g. admin charity image upload) — bypasses JSON body serialization. */
async function uploadFile<T>(path: string, formData: FormData, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: formData });

  if (res.status === 401 && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return uploadFile<T>(path, formData, true);
  }

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new ApiClientError(body.error.code, body.error.message, res.status, body.error.details);
  }
  return body.data;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) => request<T>(path, { ...options, method: "DELETE" }),
  uploadFile,
};
