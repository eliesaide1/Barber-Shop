import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError } from '../api/client';
import { getSocket } from '../api/socket';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * GET a path, with a refresh on screen focus so returning to a screen never
 * shows stale data. `deps` re-fetches when they change.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: !!path, error: null });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!path) return;
      if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api.get<T>(path);
        if (mounted.current) setState({ data, loading: false, error: null });
      } catch (err) {
        if (mounted.current) {
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof ApiError ? err.message : 'Something went wrong',
          }));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, ...deps],
  );

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  return { ...state, reload: load, setData: (d: T) => setState((s) => ({ ...s, data: d })) };
}

/** Subscribe to a socket event for as long as the component is mounted. */
export function useSocketEvent(event: string, handler: (...args: any[]) => void) {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const fn = (...args: any[]) => saved.current(...args);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [event]);
}
