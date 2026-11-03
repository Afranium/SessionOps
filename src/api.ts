import type { Filters, ImportRecord, Mapping, PreviewResponse, SessionRow, Tracking } from './types';
import { weekendKey } from './lib';

export class AuthError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options
  });

  if (response.status === 401) throw new AuthError('Authentication required');

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function checkSession() {
  return request<{ authenticated: boolean }>('/api/session');
}

export function login(password: string) {
  return request<{ authenticated: boolean }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

export function logout() {
  return request<{ authenticated: boolean }>('/api/logout', { method: 'POST' });
}

export function fetchSessions() {
  return request<{ sessions: SessionRow[]; imports: ImportRecord[] }>('/api/sessions');
}

export function fetchImports() {
  return request<{ imports: ImportRecord[] }>('/api/imports');
}

export function patchTracking(id: number, patch: Partial<Tracking>) {
  return request<{ tracking: Tracking }>(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export function bulkTracking(ids: number[], patch: Partial<Tracking>) {
  return request<{ updated: { id: number; tracking: Tracking }[] }>('/api/tracking/bulk', {
    method: 'POST',
    body: JSON.stringify({ ids, patch })
  });
}

export function previewImport(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<PreviewResponse>('/api/import/preview', { method: 'POST', body: form });
}

export function commitImport(payload: {
  token: string;
  sheetName: string;
  headerRow: number;
  mapping: Mapping;
}) {
  return request<{ inserted: number; updated: number; skipped: number; total: number }>('/api/import/commit', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function commitWeeklyImport(payload: { token: string; sectionIds: string[] }) {
  return request<{ inserted: number; updated: number; skipped: number; total: number; sections: number }>(
    '/api/import/weekly/commit',
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

export async function downloadExport(ids: number[] | null, layout: 'weekly' | 'tracking' = 'weekly') {
  const response = await fetch('/api/export', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids, layout } : { layout })
  });

  if (response.status === 401) throw new AuthError('Authentication required');
  if (!response.ok) {
    let message = 'Export failed';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${layout === 'weekly' ? 'IDL-weekend-attendance' : 'session-tracking'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export function filterSessions(sessions: SessionRow[], filters: Filters) {
  const query = filters.q.trim().toLowerCase();
  return sessions.filter((session) => {
    if (filters.weekend) {
      const key = weekendKey(session.date);
      if (key !== filters.weekend) return false;
    }
    if (filters.programme && session.programme !== filters.programme) return false;
    if (filters.centre && session.centre !== filters.centre) return false;
    if (filters.modality && session.modality !== filters.modality) return false;
    if (filters.status && session.tracking.status !== filters.status) return false;
    if (query) {
      const haystack = [
        session.courseCode,
        session.courseTitle,
        session.facilitator,
        session.facilitatorEmail,
        session.centre,
        session.programme
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
