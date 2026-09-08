/**
 * Client for the admin API. Attaches the operator identity (mock SSO) so the API
 * can enforce roles; production replaces the headers with the SSO bearer token.
 */
import { useStore } from '@/lib/admin/store';

export interface ApiError { status: number; code: string; message: string }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const op = useStore.getState().operator;
  return { 'Content-Type': 'application/json', ...(op ? { 'x-admin-actor': op.email, 'x-admin-role': op.role } : {}), ...extra };
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) return { ok: false, error: { status: res.status, code: body?.error?.code ?? 'HTTP_ERROR', message: body?.error?.message ?? `HTTP ${res.status}` } };
  return { ok: true, data: body.data as T };
}

export const api = {
  get: <T,>(path: string) => fetch(`/api/admin/${path}`, { headers: headers() }).then((r) => parse<T>(r)).catch((): ApiResult<T> => ({ ok: false, error: { status: 0, code: 'NETWORK', message: 'Could not reach the admin API.' } })),
  post: <T,>(path: string, body: unknown) => fetch(`/api/admin/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then((r) => parse<T>(r)).catch((): ApiResult<T> => ({ ok: false, error: { status: 0, code: 'NETWORK', message: 'Could not reach the admin API.' } })),
  patch: <T,>(path: string, body: unknown) => fetch(`/api/admin/${path}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) }).then((r) => parse<T>(r)).catch((): ApiResult<T> => ({ ok: false, error: { status: 0, code: 'NETWORK', message: 'Could not reach the admin API.' } })),
  delete: <T,>(path: string, body: unknown) => fetch(`/api/admin/${path}`, { method: 'DELETE', headers: headers(), body: JSON.stringify(body) }).then((r) => parse<T>(r)).catch((): ApiResult<T> => ({ ok: false, error: { status: 0, code: 'NETWORK', message: 'Could not reach the admin API.' } })),
};

export const fmt = {
  n: (v: number) => v.toLocaleString(),
  credits: (v: number) => `${v.toLocaleString()} cr`,
  pct: (v: number | null) => (v === null ? '—' : `${v}%`),
  ago: (isoOrMs: string | number) => {
    const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  },
  date: (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'),
  dateTime: (isoOrMs: string | number) => new Date(isoOrMs).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  inDays: (iso: string | null) => { if (!iso) return '—'; const d = Math.round((Date.parse(iso) - Date.now()) / 86_400_000); return d < 0 ? `${Math.abs(d)}d ago` : d === 0 ? 'today' : `in ${d}d`; },
};
