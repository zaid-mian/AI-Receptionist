// Typed HTTP + SSE client for the AI Receptionist backend.
// All fetch calls in the app go through this module.

import type { ChatEvent } from './types';

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8787';
const PREFIX = '/api/v1';

let authToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('fh_auth_token') : null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem('fh_auth_token', token);
  } else {
    localStorage.removeItem('fh_auth_token');
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

export class ApiError extends Error {
  code: string;
  status: number;
  recoverable: boolean;

  constructor(message: string, code = 'unknown', status = 0, recoverable = true) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.recoverable = recoverable;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
  success?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as ErrorBody;
    if (body.error) {
      if (body.error.code) code = body.error.code;
      if (body.error.message) message = body.error.message;
    }
  } catch {
    // keep defaults
  }
  return new ApiError(message, code, res.status, res.status !== 401 && res.status !== 403);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  try {
    res = await fetch(`${API_BASE}${PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(
      'Cannot reach the backend. Make sure it is running on http://localhost:8787.',
      'network_unreachable',
      0,
      true,
    );
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * POST + SSE reader. EventSource cannot do POST, so we parse `event:`/`data:`
 * frames from a fetch ReadableStream manually.
 */
export async function postSSE(
  path: string,
  body: unknown,
  onEvent: (ev: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${PREFIX}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    throw new ApiError(
      'Cannot reach the backend. Make sure it is running on http://localhost:8787.',
      'network_unreachable',
      0,
      true,
    );
  }
  if (!res.ok) throw await parseError(res);
  if (!res.body) throw new ApiError('Empty response stream from server.', 'empty_stream', 0, true);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchFrame = (frame: string) => {
    let eventName = '';
    let dataText = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataText += line.slice(5).trim();
      else if (line.startsWith(':')) continue; // heartbeat comment
    }
    if (!eventName || !dataText) return;
    try {
      onEvent({ event: eventName, data: JSON.parse(dataText) } as ChatEvent);
    } catch {
      // ignore malformed frame
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        dispatchFrame(frame);
      }
    }
    if (buffer.trim()) dispatchFrame(buffer);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    throw err;
  } finally {
    reader.releaseLock();
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Build a query string from optional params, skipping empties. */
export function qs(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
}
