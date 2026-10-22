import { env } from "./env";

/** Error shape returned by the API: `{ error: { code, message, details, requestId } }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field-level messages from class-validator (`details.fields`), if any. */
  get fieldMessages(): string[] {
    const d = this.details as { fields?: unknown } | null | undefined;
    return Array.isArray(d?.fields) ? d.fields.filter((f): f is string => typeof f === "string") : [];
  }
}

const STATUS_CODES: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
};

/** Turns a failed response body (parsed JSON, raw text or nothing) into an ApiError. */
export function parseApiError(status: number, body: unknown, requestIdHeader?: string | null): ApiError {
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
  }
  const envelope = (parsed as { error?: unknown } | null)?.error;
  if (envelope && typeof envelope === "object") {
    const e = envelope as { code?: unknown; message?: unknown; details?: unknown; requestId?: unknown };
    const code = typeof e.code === "string" && e.code ? e.code : (STATUS_CODES[status] ?? "INTERNAL");
    const message = typeof e.message === "string" && e.message ? e.message : `Request failed (${status})`;
    const requestId = typeof e.requestId === "string" ? e.requestId : (requestIdHeader ?? undefined);
    return new ApiError(status, code, message, e.details ?? undefined, requestId);
  }
  const text = typeof parsed === "string" && parsed.trim() && parsed.length < 300 ? parsed.trim() : "";
  return new ApiError(status, STATUS_CODES[status] ?? "INTERNAL", text || `Request failed (${status})`, undefined, requestIdHeader ?? undefined);
}

/** A readable message for any thrown value, including validation field details. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = err.fieldMessages;
    return fields.length ? `${err.message}: ${fields.join("; ")}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

interface AuthHooks {
  getToken: () => string | null;
  onUnauthorized: () => void;
}

let auth: AuthHooks = { getToken: () => null, onUnauthorized: () => {} };

/** Called by AuthProvider so every request carries the current bearer token. */
export function configureApiAuth(hooks: AuthHooks) {
  auth = hooks;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, query?: Query, base = env.apiUrl): string {
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Overrides the configured token (used by dev sign-in before a session exists). */
  token?: string | null;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opts.token !== undefined ? opts.token : auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", `Cannot reach the API at ${env.apiUrl}. Is it running, and does CORS allow this origin?`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = parseApiError(res.status, text, res.headers.get("x-request-id"));
    if (res.status === 401 && token) auth.onUnauthorized();
    throw error;
  }
  return res;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => apiRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body: body ?? {} }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

/** Downloads an authenticated file (CSV reports) by fetching it as a blob. */
export async function apiDownload(path: string, query: Query, filename: string): Promise<void> {
  const res = await send(path, { query });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
