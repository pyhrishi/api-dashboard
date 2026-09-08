'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/admin/api';

export type LoadState<T> = { status: 'loading' } | { status: 'ok'; data: T; refreshing: boolean } | { status: 'error'; message: string };

/** Load an admin API path; `reload()` keeps the last data on screen while refreshing (no layout jump). */
export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const latest = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++latest.current;
    setState((s) => (s.status === 'ok' ? { ...s, refreshing: true } : { status: 'loading' }));
    const res = await api.get<T>(path);
    if (id !== latest.current) return;
    setState(res.ok ? { status: 'ok', data: res.data, refreshing: false } : { status: 'error', message: res.error.message });
  }, [path]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's cache key
  useEffect(() => { reload(); }, [reload, ...deps]);
  return { state, reload, setState };
}
