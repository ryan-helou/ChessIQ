"use client";

import { useEffect, useRef, useState } from "react";

export interface AbortableFetchState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Fetches a JSON endpoint and cancels the in-flight request when the component
 * unmounts or `deps` change. Surfaces {data, error, loading}; swallows
 * AbortError so navigation doesn't produce false errors.
 *
 * Pass `null` as the URL to pause (useful when a prerequisite isn't ready).
 */
export function useAbortableFetch<T>(
  url: string | null,
  deps: React.DependencyList = [],
  init?: RequestInit,
): AbortableFetchState<T> {
  const [state, setState] = useState<AbortableFetchState<T>>({
    data: null,
    error: null,
    loading: url != null,
  });
  const initRef = useRef(init);
  initRef.current = init;

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    const ctrl = new AbortController();
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetch(url, { ...initRef.current, signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (!cancelled) setState({ data: json, error: null, loading: false });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setState({
          data: null,
          error: err instanceof Error ? err : new Error(String(err)),
          loading: false,
        });
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return state;
}
