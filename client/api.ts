import type { AppConfig, CreateInvestigationRequest, ImportResult, Investigation, PreviewRequest, PreviewResponse, QueryRequest, QueryResult, ResolveRequest, ResolveResponse, UndoRequest } from '../shared/contracts';

export type ExportFormat = 'csv' | 'xlsx' | 'report';

export class RequestError extends Error {
  constructor(message: string, public code = 'REQUEST_FAILED', public status = 0) { super(message); this.name = 'RequestError'; }
}

let configPromise: Promise<AppConfig> | undefined;
let token: (() => Promise<string | undefined>) | undefined;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const authToken = await token?.();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' }); }
  catch { throw new RequestError('The agency could not reach the records room. Check your connection and try again.', 'NETWORK_ERROR'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new RequestError(body?.error?.message ?? `The request could not be completed (${response.status}).`, body?.error?.code, response.status);
  }
  return response.json() as Promise<T>;
}

export function connect(): Promise<AppConfig> {
  configPromise ??= request<AppConfig>('/config').then(async (config) => {
    if (config.authMode === 'firebase') {
      if (!config.firebaseConfig) throw new RequestError('Cloud authentication is not configured.');
      const { connectFirebase } = await import('./auth/firebase');
      token = await connectFirebase(config.firebaseConfig);
    } else {
      token = undefined;
    }
    return config;
  }).catch((error: unknown) => { configPromise = undefined; throw error; });
  return configPromise;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const api = {
  demo: (name: 'market' | 'club') => post<ImportResult>('/demo', { name }),
  import: (files: File[]) => { const data = new FormData(); files.forEach((file) => data.append('files', file)); return request<ImportResult>('/imports', { method: 'POST', body: data }); },
  create: (body: CreateInvestigationRequest) => post<Investigation>('/investigations', body),
  get: (id: string) => request<Investigation>(`/investigations/${encodeURIComponent(id)}`),
  preview: (id: string, body: PreviewRequest) => post<PreviewResponse>(`/investigations/${encodeURIComponent(id)}/preview`, body),
  resolve: (id: string, body: ResolveRequest) => post<ResolveResponse>(`/investigations/${encodeURIComponent(id)}/resolve`, body),
  undo: (id: string, body: UndoRequest) => post<ResolveResponse>(`/investigations/${encodeURIComponent(id)}/undo`, body),
  query: (id: string, body: QueryRequest) => post<QueryResult>(`/investigations/${encodeURIComponent(id)}/query`, body),
  saveFinding: (id: string, findingId: string) => post<Investigation>(`/investigations/${encodeURIComponent(id)}/findings`, { findingId }),
  async export(id: string, format: ExportFormat, tableId?: string) {
    const headers = new Headers();
    const authToken = await token?.();
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
    const params = new URLSearchParams({ format });
    if (tableId) params.set('tableId', tableId);
    const response = await fetch(`/api/investigations/${encodeURIComponent(id)}/export?${params}`, { headers, credentials: 'include' });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new RequestError(body?.error?.message ?? 'The export could not be prepared.');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ?? `maplewick-case.${format === 'report' ? 'json' : format}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
