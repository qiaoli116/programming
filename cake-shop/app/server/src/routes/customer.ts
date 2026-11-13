import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import {
  OCCASIONS,
  SHOP,
  SLOTS,
  applyField,
  check,
  daysBetween,
  defaultDesign,
  fittingSize,
  price,
  template,
  type Brief,
  type Contact,
  type Design,
  type DesignField,
  type Dietary,
  type Order,
} from '@cakeshop/shared';
import { AssistantFailure, HttpError } from '../errors';
import { addChat, applyBriefChange, applyChange, isBriefField, nowOf, todayOf, type Clock } from '../orders/applyChange';
import { assertDesigning, moveStatus } from '../orders/status';
import { parseBrief } from '../orders/brief';
import { undoGroup } from '../orders/undo';
import type { Assistant } from '../assistant/service';
import { plainAck } from '../assistant/service';
import type { OrderStore } from '../store';
import { toView } from './view';

export interface Deps {
  store: OrderStore;
  assistant: Assistant;
  clock: Clock;
}

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

const DESIGN_FIELDS: DesignField[] = ['size', 'sponge', 'filling', 'finish', 'colour', 'decorations', 'topper', 'message', 'picture', 'digits', 'glutenFree', 'vegan', 'extras'];
function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function tokenMatches(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function contactFrom(raw: unknown): Contact {
  const c = (raw ?? {}) as Record<string, unknown>;
  const name = String(c.name ?? '').trim();
  const phone = String(c.phone ?? '').trim();
  const email = String(c.email ?? '').trim();
  if (!name || name.length > 80) throw new HttpError(400, 'Enter your name.');
  if (phone.replace(/\D/g, '').length < 6) throw new HttpError(400, 'Enter a phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  return { name, phone, email };
}

export function customerRouter({ store, assistant, clock }: Deps): Router {
  const r = Router();

  /** Loads the order. A wrong or missing token answers 404, the same as an unknown id. */
  const load = (req: Request): Order => {
    const order = store.get(String(req.params.id));
    const t = typeof req.query.t === 'string' ? req.query.t : '';
    if (!order || !t || !tokenMatches(order.token, t)) throw new HttpError(404, 'Not found.');
    return order;
  };

  r.post(
    '/orders',
    wrap(async (req, res) => {
      const now = nowOf(clock);
      const brief = parseBrief(req.body?.brief, todayOf(clock));
      const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1000) : '';
      const order: Order = {
        id: store.nextId(),
        token: newToken(),
        status: 'DESIGNING',
        brief,
        chat: [],
        options: [],
        design: null,
        quote: null,
        contact: null,
        approval: null,
        confirmation: null,
        events: [{ at: now, by: 'customer', type: 'status', text: 'Order started.' }],
        createdAt: now,
        updatedAt: now,
        jobs: [],
        lastCustomerAt: now,
      };
      store.insert(order);
      const tplId = req.body?.template;
      if (typeof tplId === 'string' && template(tplId)) {
        const design = { ...defaultDesign(tplId, brief), size: fittingSize(tplId, brief.guests) };
        const result = applyChange(store, order, design, 'choose', clock, `started from ${template(tplId)!.name}`);
        if (!result.ok) {
          addChat(order, { kind: 'system', text: `We couldn't start from that template: ${result.reasons.map((x) => x.text).join(' ')}` }, now);
          store.save(order);
        }
      }
      if (text) addChat(order, { kind: 'customer', text }, now);
      store.save(order);
      try {
        await assistant.message(order.id);
      } catch (err) {
        if (!(err instanceof AssistantFailure)) throw err;
        const fresh = store.get(order.id)!;
        addChat(fresh, { kind: 'system', text: "The assistant didn't answer. Try again." }, nowOf(clock));
        store.save(fresh);
      }
      res.status(201).json({ id: order.id, token: order.token, order: toView(store.get(order.id)!, clock) });
    }),
  );

  r.get(
    '/orders/:id',
    wrap((req, res) => {
      res.json(toView(load(req), clock));
    }),
  );

  r.post(
    '/orders/:id/messages',
    wrap(async (req, res) => {
      const order = load(req);
      assertDesigning(order);
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text || text.length > 1000) throw new HttpError(400, 'Write a message of up to 1000 characters.');
      const now = nowOf(clock);
      addChat(order, { kind: 'customer', text }, now);
      order.lastCustomerAt = now;
      store.save(order);
      try {
        await assistant.message(order.id);
      } catch (err) {
        if (err instanceof AssistantFailure) throw new HttpError(502, "The assistant didn't answer. Try again.");
        throw err;
      }
      res.json(toView(store.get(order.id)!, clock));
    }),
  );

  r.post(
    '/orders/:id/choose',
    wrap((req, res) => {
      const order = load(req);
      assertDesigning(order);
      const cand = order.options.find((o) => o.id === Number(req.body?.candidate));
      if (!cand) throw new HttpError(400, 'Unknown option.');
      const result = applyChange(store, order, cand.design, 'choose', clock, `chose "${cand.title}"`);
      if (!result.ok) throw new HttpError(422, 'That option no longer fits.', result.reasons);
      const fresh = store.get(order.id)!;
      addChat(fresh, { kind: 'customer', text: `I choose "${cand.title}".` }, nowOf(clock));
      fresh.lastCustomerAt = nowOf(clock);
      store.save(fresh);
      res.json(toView(fresh, clock));
    }),
  );

  r.patch(
    '/orders/:id/design',
    wrap((req, res) => {
      const order = load(req);
      assertDesigning(order);
      if (!order.design) throw new HttpError(409, 'Choose a design first.');
      const field = req.body?.field as DesignField;
      if (!DESIGN_FIELDS.includes(field)) throw new HttpError(400, 'Unknown design field.');
      const value = req.body?.value;
      if (!['string', 'boolean'].includes(typeof value) && !Array.isArray(value)) throw new HttpError(400, 'Missing value.');
      if (typeof value === 'string' && value.length > 60) throw new HttpError(400, 'That value is too long.');
      const proposed: Design = applyField(order.design, field, value);
      order.lastCustomerAt = nowOf(clock);
      const result = applyChange(store, order, proposed, 'panel', clock);
      if (!result.ok) throw new HttpError(422, result.reasons[0].text, result.reasons);
      res.json(toView(result.order, clock));
    }),
  );

  /** The browser calls this a moment after quick changes stop, so several changes get one acknowledgement. */
  r.post(
    '/orders/:id/ack',
    wrap(async (req, res) => {
      const order = load(req);
      assertDesigning(order);
      try {
        await assistant.ack(order.id);
      } catch {
        plainAck(store, order.id, clock);
      }
      res.json(toView(store.get(order.id)!, clock));
    }),
  );

  r.patch(
    '/orders/:id/brief',
    wrap((req, res) => {
      const order = load(req);
      assertDesigning(order);
      const field = String(req.body?.field);
      if (!isBriefField(field)) throw new HttpError(400, 'Unknown order detail.');
      const merged = parseBrief({ ...order.brief, [field]: req.body?.value }, todayOf(clock));
      const result = applyBriefChange(store, order, merged, clock);
      if (!result.ok) throw new HttpError(422, result.reasons[0].text, result.reasons);
      res.json(toView(result.order, clock));
    }),
  );

  /** Reverts one assistant turn (a change group) to the order as it was before that turn. */
  r.post(
    '/orders/:id/undo',
    wrap((req, res) => {
      const order = load(req);
      const group = typeof req.body?.group === 'string' ? req.body.group : '';
      if (!group) throw new HttpError(400, 'Which change?');
      res.json(toView(undoGroup(store, order, group, clock), clock));
    }),
  );

  r.post(
    '/orders/:id/confirm',
    wrap((req, res) => {
      const order = load(req);
      assertDesigning(order);
      if (req.body?.final !== true) throw new HttpError(400, 'Confirm that the design is final.');
      if (!order.design) throw new HttpError(409, 'There is no design to confirm.');
      const contact = contactFrom(req.body?.contact);
      const fulfilment = req.body?.fulfilment ?? order.brief.fulfilment;
      const slot = String(req.body?.slot ?? order.brief.slot ?? '');
      if (fulfilment !== 'pickup' && fulfilment !== 'delivery') throw new HttpError(400, 'Fulfilment is pickup or delivery.');
      if (!SLOTS.some((s) => s.id === slot)) throw new HttpError(400, 'Choose a time slot.');
      const brief: Brief = { ...order.brief, fulfilment, slot };
      const result = check(order.design, brief, todayOf(clock));
      if (!result.ok) throw new HttpError(422, result.reasons[0].text, result.reasons);
      const now = nowOf(clock);
      order.brief = brief;
      order.contact = contact;
      order.quote = price(order.design, brief);
      order.lastCustomerAt = now;
      moveStatus(order, 'AWAITING_BAKER', now, 'customer', 'The customer confirmed the final design.');
      order.events.push({ at: now, by: 'server', type: 'notice', text: `Email to ${contact.email}: we have your design and our baker is checking it.` });
      store.save(order);
      res.json(toView(order, clock));
    }),
  );

  return r;
}
