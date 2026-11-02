'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
}

/** Loads data on mount and whenever `key` changes; stale responses are ignored. */
export function useResource<T>(load: () => Promise<T>, key: string): Resource<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    let active = true;
    setLoading(true);
    loader
      .current()
      .then((value) => {
        if (!active) return;
        setData(value);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(toApiError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, error, loading, reload };
}

/** Runs a mutation and exposes its pending/error state. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError>();
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setError(undefined);
    try {
      return await work();
    } catch (reason) {
      setError(toApiError(reason));
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, run, clearError: () => setError(undefined) };
}

export function toApiError(reason: unknown): ApiError {
  if (reason instanceof ApiError) return reason;
  return new ApiError(0, 'UNEXPECTED', reason instanceof Error ? reason.message : 'Erro inesperado.');
}
