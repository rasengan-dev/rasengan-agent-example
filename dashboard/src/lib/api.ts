import type { AgentEvent, EngineId, StopReason, Usage } from '../../../server/src/agent/events';

export type { AgentEvent, EngineId, StopReason, Usage };

/** The agent server. Same origin in Docker; its own port with `pnpm dev`. */
export const API_ORIGIN =
  (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

export interface ServerState {
  engines: { id: EngineId; label: string; file: string }[];
  models: string[];
  previewUrl: string;
  preview: 'starting' | 'ready' | 'crashed' | 'stopped';
  running: boolean;
  hasApiKey: boolean;
}

export interface RunInput {
  message: string;
  engine: EngineId;
  model: string;
  budgetUsd: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export const api = {
  state: () => request<ServerState>('/api/state'),
  startRun: (input: RunInput) => request<{ runId: string }>('/api/runs', { method: 'POST', body: JSON.stringify(input) }),
  stopRun: () => request('/api/runs/stop', { method: 'POST' }),
  reset: () => request('/api/reset', { method: 'POST' }),
  files: () => request<{ files: string[] }>('/api/files'),
  file: (path: string) => request<{ path: string; content: string }>(`/api/file?path=${encodeURIComponent(path)}`),
  logs: () => request<{ status: string; log: string }>('/api/logs'),
  eventsUrl: `${API_ORIGIN}/api/events`,
};
