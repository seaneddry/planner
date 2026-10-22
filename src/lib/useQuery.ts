import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A small data layer with an offline cache.
 *
 * - Every query re-runs when `bump()` is called (after any save), so screens never show stale data.
 * - Queries with a cache key keep their last result in localStorage. The screen shows that
 *   instantly on open and keeps showing it when the network is down (with `offline` set).
 * - Changes made while offline go through the outbox (see outbox.ts) and are sent later.
 */
interface DataContextValue {
  version: number;
  bump: () => void;
}

const DataContext = createContext<DataContextValue>({ version: 0, bump: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, bump }), [version, bump]);

  // Refresh when the app comes back to the foreground or the network returns,
  // so a change made on the phone shows on the laptop without a reload.
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 15000) {
        last = Date.now();
        bump();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', bump);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', bump);
    };
  }, [bump]);

  return createElement(DataContext.Provider, { value }, children);
}

export function useBump(): () => void {
  return useContext(DataContext).bump;
}

const PREFIX = 'planner:cache:';

export function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works, just without the offline copy.
  }
}

export function clearCache(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export interface QueryState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  /** True when showing the saved copy because the network is unavailable. */
  offline: boolean;
  reload: () => void;
}

export function useQuery<T>(fn: () => Promise<T>, deps: readonly unknown[], cacheKey?: string): QueryState<T> {
  const { version } = useContext(DataContext);
  const [state, setState] = useState<{ data: T | undefined; error: string | undefined; loading: boolean; offline: boolean }>(() => ({
    data: cacheKey ? readCache<T>(cacheKey) : undefined,
    error: undefined,
    loading: true,
    offline: false,
  }));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, error: undefined, loading: true, data: s.data ?? (cacheKey ? readCache<T>(cacheKey) : undefined) }));
    fn()
      .then((data) => {
        if (!alive) return;
        if (cacheKey) writeCache(cacheKey, data);
        setState({ data, error: undefined, loading: false, offline: false });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const cached = cacheKey ? readCache<T>(cacheKey) : undefined;
        if (cached !== undefined && isNetworkError(e)) {
          setState({ data: cached, error: undefined, loading: false, offline: true });
        } else {
          setState((s) => ({ ...s, error: errorMessage(e), loading: false }));
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = errorMessage(e).toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed');
}
