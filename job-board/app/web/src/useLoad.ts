import { useEffect, useState } from 'react';
import { ApiRequestError } from './api';

export interface Loaded<T> {
  data: T | null;
  error: ApiRequestError | null;
  loading: boolean;
}

/** Runs an API call when the page opens (and again when `deps` change). */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (err) =>
        !cancelled &&
        setState({
          data: null,
          error: err instanceof ApiRequestError ? err : new ApiRequestError(0, 'ERROR', 'Something went wrong.'),
          loading: false,
        }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
