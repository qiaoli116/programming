import type { Brief, CheckResult, Contact, Order, OrderEvent, OrderView, Reason } from '@cakeshop/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public reasons?: Reason[],
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong.', data.reasons);
  return data as T;
}

const o = (id: string, t: string, path = '') => `/api/orders/${id}${path}?t=${encodeURIComponent(t)}`;

export const api = {
  create: (brief: Brief, text?: string, template?: string) =>
    call<{ id: string; token: string; order: OrderView }>('POST', '/api/orders', { brief, text, template }),
  get: (id: string, t: string) => call<OrderView>('GET', o(id, t)),
  message: (id: string, t: string, text: string) => call<OrderView>('POST', o(id, t, '/messages'), { text }),
  choose: (id: string, t: string, candidate: number) => call<OrderView>('POST', o(id, t, '/choose'), { candidate }),
  design: (id: string, t: string, field: string, value: unknown) => call<OrderView>('PATCH', o(id, t, '/design'), { field, value }),
  brief: (id: string, t: string, field: string, value: unknown) => call<OrderView>('PATCH', o(id, t, '/brief'), { field, value }),
  ack: (id: string, t: string) => call<OrderView>('POST', o(id, t, '/ack')),
  undo: (id: string, t: string, group: string) => call<OrderView>('POST', o(id, t, '/undo'), { group }),
  confirm: (id: string, t: string, body: { fulfilment: string; slot: string; contact: Contact; final: true }) =>
    call<OrderView>('POST', o(id, t, '/confirm'), body),
  baker: {
    session: () => call<{ ok: boolean }>('GET', '/api/baker/session'),
    login: (password: string) => call<{ ok: true }>('POST', '/api/baker/login', { password }),
    logout: () => call<{ ok: true }>('POST', '/api/baker/logout'),
    list: (status: string) => call<{ orders: BakerSummary[]; counts: Record<string, number> }>('GET', `/api/baker/orders?status=${status}`),
    get: (id: string) =>
      call<{ order: Omit<Order, 'token'> & { events: OrderEvent[] }; check: CheckResult | null; bakeDay: string; sameDay: BakerSummary[] }>('GET', `/api/baker/orders/${id}`),
    approve: (id: string) => call<unknown>('POST', `/api/baker/orders/${id}/approve`),
    decline: (id: string, reason: string) => call<unknown>('POST', `/api/baker/orders/${id}/decline`, { reason }),
  },
};

/** One row of the baker's inbox (and the same-day list). */
export interface BakerSummary {
  id: string;
  status: Order['status'];
  name: string;
  template: string;
  occasion: string;
  guests: number;
  date: string;
  slot: string | null;
  total: number;
  design: Order['design'];
  updatedAt: string;
}
