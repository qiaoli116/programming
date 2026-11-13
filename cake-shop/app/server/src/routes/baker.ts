import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { check, template, type Order, type Status } from '@cakeshop/shared';
import { HttpError } from '../errors';
import { moveStatus } from '../orders/status';
import { nowOf, todayOf, type Clock } from '../orders/applyChange';
import type { OrderStore } from '../store';
import { wrap } from './customer';

export const COOKIE = 'baker_session';

export interface BakerDeps {
  store: OrderStore;
  clock: Clock;
  password: string;
  sessionHours: number;
  secureCookie: boolean;
}

const TABS: Record<string, Status[]> = {
  waiting: ['AWAITING_BAKER'],
  approved: ['CONFIRMED'],
  declined: ['DECLINED'],
};

export function bakeDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function summary(o: Order) {
  return {
    id: o.id,
    status: o.status,
    name: o.contact?.name ?? '',
    template: template(o.design?.template ?? '')?.name ?? '',
    occasion: o.brief.occasion,
    guests: o.brief.guests,
    date: o.brief.date,
    slot: o.brief.slot ?? null,
    total: o.quote?.total ?? 0,
    design: o.design,
    updatedAt: o.updatedAt,
  };
}

export function bakerRouter({ store, clock, password, sessionHours, secureCookie }: BakerDeps): Router {
  const r = Router();
  const sessions = new Map<string, number>();

  const requireBaker = (req: Request, _res: Response, next: NextFunction) => {
    const sid = req.cookies?.[COOKIE];
    const exp = typeof sid === 'string' ? sessions.get(sid) : undefined;
    if (!exp || exp < clock().getTime()) throw new HttpError(401, 'Sign in as the baker.');
    next();
  };

  r.post('/login', (req, res) => {
    const given = Buffer.from(String(req.body?.password ?? ''));
    const want = Buffer.from(password);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new HttpError(401, 'Wrong password.');
    const sid = crypto.randomBytes(24).toString('base64url');
    sessions.set(sid, clock().getTime() + sessionHours * 3600000);
    res.cookie(COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: sessionHours * 3600000 });
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => {
    sessions.delete(String(req.cookies?.[COOKIE]));
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  r.get('/session', requireBaker, (_req, res) => {
    res.json({ ok: true });
  });

  r.get(
    '/orders',
    requireBaker,
    wrap((req, res) => {
      const tab = String(req.query.status ?? 'waiting');
      const statuses = TABS[tab] ?? ([tab] as Status[]);
      const list = store
        .list(statuses)
        .sort((a, b) => a.brief.date.localeCompare(b.brief.date) || a.createdAt.localeCompare(b.createdAt))
        .map(summary);
      const counts = Object.fromEntries(Object.entries(TABS).map(([k, v]) => [k, store.list(v).length]));
      res.json({ orders: list, counts });
    }),
  );

  const load = (req: Request): Order => {
    const o = store.get(String(req.params.id));
    if (!o || o.status === 'DESIGNING' || o.status === 'ABANDONED') throw new HttpError(404, 'Not found.');
    return o;
  };

  r.get(
    '/orders/:id',
    requireBaker,
    wrap((req, res) => {
      const order = load(req);
      const day = bakeDay(order.brief.date);
      const sameDay = store
        .list(['CONFIRMED'])
        .filter((o) => o.id !== order.id && bakeDay(o.brief.date) === day)
        .map(summary);
      const { token: _t, ...safe } = order;
      void _t;
      res.json({ order: safe, check: order.design ? check(order.design, order.brief, todayOf(clock)) : null, bakeDay: day, sameDay });
    }),
  );

  r.post(
    '/orders/:id/approve',
    requireBaker,
    wrap((req, res) => {
      const order = load(req);
      const now = nowOf(clock);
      moveStatus(order, 'CONFIRMED', now, 'baker', 'The baker approved the order.');
      order.approval = { decision: 'approved', at: now };
      // The Confirmer: the payment is simulated in iteration 1.
      order.confirmation = { paid: 'simulated', amount: order.quote?.total ?? 0, at: now };
      order.events.push({ at: now, by: 'server', type: 'notice', text: `Email to ${order.contact?.email}: your order ${order.id} is confirmed. Payment of $${order.confirmation.amount} (simulated).` });
      store.save(order);
      res.json({ ok: true, status: order.status });
    }),
  );

  r.post(
    '/orders/:id/decline',
    requireBaker,
    wrap((req, res) => {
      const order = load(req);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason || reason.length > 300) throw new HttpError(400, 'Give a reason of up to 300 characters.');
      const now = nowOf(clock);
      moveStatus(order, 'DECLINED', now, 'baker', 'The baker declined the order.');
      order.approval = { decision: 'declined', reason, at: now };
      order.events.push({ at: now, by: 'server', type: 'notice', text: `Email to ${order.contact?.email}: we can't make order ${order.id}. ${reason}` });
      store.save(order);
      res.json({ ok: true, status: order.status });
    }),
  );

  return r;
}
