// The HTTP side of the trace (devlog 07): what the customer did in the studio, the request it made, and the answer.
// Only the order routes are traced. Only the fields that tell the story are recorded (the text of a message, the field
// and value of a change), never a whole body: the confirm request holds contact details, and the token is only in the query.
import type { RequestHandler } from 'express';
import type { OrderStore } from '../store';
import type { Trace } from '../trace';
import { tokenMatches } from './customer';

const ORDER_PATH = /^\/orders\/([^/]+)(?:\/([a-z]+))?\/?$/;
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const shown = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

type Body = Record<string, unknown>;

/** What the person did in the studio, in words (null for requests the studio makes by itself), and the data worth showing. */
function describe(method: string, sub: string | undefined, body: Body): { user: string | null; data?: unknown } {
  if (method === 'GET') return { user: null };
  switch (sub) {
    case undefined:
      return { user: 'starts an order' };
    case 'messages':
      return { user: `sends "${clip(String(body.text ?? ''))}"`, data: { text: String(body.text ?? '').slice(0, 300) } };
    case 'design':
    case 'brief':
      return { user: `sets ${String(body.field)} to ${clip(shown(body.value), 40)}`, data: { field: body.field, value: body.value } };
    case 'choose':
      return { user: 'chooses an option', data: { candidate: body.candidate } };
    case 'undo':
      return { user: 'presses Undo', data: { group: body.group } };
    case 'confirm':
      return { user: 'confirms the final design' };
    default:
      return { user: null };
  }
}

export function traceHttp(trace: Trace, store: OrderStore): RequestHandler {
  return (req, res, next) => {
    const m = trace.enabled ? ORDER_PATH.exec(req.path) : null;
    const creating = trace.enabled && req.method === 'POST' && /^\/orders\/?$/.test(req.path);
    const sub = m?.[2];
    if ((!m && !creating) || sub === 'trace') return next();
    // Only for a real order and its token, so a stranger's requests can't fill the trace.
    if (m) {
      const order = store.get(m[1]);
      const t = typeof req.query.t === 'string' ? req.query.t : '';
      if (!order || !t || !tokenMatches(order.token, t)) return next();
    }

    const t0 = Date.now();
    const poll = req.method === 'GET';
    const label = `${req.method} ${req.path}`;
    const id = m?.[1];
    // POST /orders has no id yet: the route records the start itself, once the order exists (see customer.ts).
    if (id && !poll) {
      const said = describe(req.method, sub, (req.body ?? {}) as Body);
      if (said.user) trace.emit(id, 'user', 'studio', said.user);
      trace.emit(id, 'studio', 'api', label, { busy: { part: 'api', label: 'request' }, ...(said.data !== undefined ? { data: said.data } : {}) });
    }

    let answer: Body = {};
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (body && typeof body === 'object') answer = body as Body;
      return json(body);
    };
    res.on('finish', () => {
      const orderId = id ?? (typeof answer.id === 'string' ? answer.id : undefined);
      if (!orderId) return;
      const view = (answer.order ?? answer) as Body;
      const busy = typeof view.busy === 'boolean' ? `  busy: ${view.busy}` : '';
      const failed = res.statusCode >= 400;
      if (poll) trace.emit(orderId, 'studio', 'api', `${label} (poll)${busy}`, { ms: Date.now() - t0 });
      else
        trace.emit(orderId, 'api', 'studio', `${res.statusCode}${busy}${failed && typeof answer.error === 'string' ? `  ${clip(answer.error)}` : ''}`, {
          ms: Date.now() - t0,
          idle: 'api',
          ...(failed ? { verdict: 'bad' as const } : {}),
        });
    });
    next();
  };
}
