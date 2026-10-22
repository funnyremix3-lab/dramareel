import { Platform } from 'react-native';
import { config } from '../config';

/** Mirrors the API error envelope `{ error: { code, message, details, requestId } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.status === 0;
  }
}

type TokenProvider = () => Promise<string | null>;
type LocaleProvider = () => string;

let getToken: TokenProvider = async () => null;
let getLocale: LocaleProvider = () => 'en';
let onUnauthorized: () => void = () => undefined;

/** Wired once at startup by the auth store and i18n (avoids import cycles). */
export function configureApiClient(opts: { token?: TokenProvider; locale?: LocaleProvider; unauthorized?: () => void }) {
  if (opts.token) getToken = opts.token;
  if (opts.locale) getLocale = opts.locale;
  if (opts.unauthorized) onUnauthorized = opts.unauthorized;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  /** Send the token when available (default true). */
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

export async function parseError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; details?: Record<string, unknown>; requestId?: string } } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON (proxy error page etc.)
  }
  const e = body.error;
  return new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText ?? 'Request failed', e?.details, e?.requestId);
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': getLocale(),
    'x-platform': Platform.OS,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  opts.signal?.addEventListener('abort', () => controller.abort());

  let res: Response;
  try {
    res = await fetch(buildUrl(config.apiUrl, path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(0, 'NETWORK', (err as Error).name === 'AbortError' ? 'Request timed out' : 'No internet connection');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const error = await parseError(res);
    if (error.status === 401 && headers.Authorization) onUnauthorized();
    throw error;
  }
  return (await res.json()) as T;
}
