import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { OrderView } from '@cakeshop/shared';
import { ApiError, api } from '../api';
import { Studio } from './Studio';
import { StatusPage } from './StatusPage';
import { Logo } from '../ui';

export function OrderPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [view, setView] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(id, token).then(setView, (e) =>
      setError(e instanceof ApiError && e.status === 404 ? "We couldn't find that order. Check the link in your email." : 'Something went wrong. Try again.'),
    );
  }, [id, token]);

  if (error) {
    return (
      <div className="page">
        <header className="app-top">
          <Logo />
        </header>
        <div className="empty" role="alert">
          {error}
        </div>
      </div>
    );
  }
  if (!view) return <div className="empty">Loading…</div>;
  if (view.status === 'DESIGNING') return <Studio id={id} token={token} view={view} setView={setView} />;
  return <StatusPage view={view} />;
}
