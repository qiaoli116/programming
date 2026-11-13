// The live loop (devlog 04 §5, devlog 05 §3). Every change to the order goes through here, whoever makes it.
// `stage*` checks, prices and logs a change on an order object without saving it; the assistant's turn uses them on
// a working copy. `apply*` stage and then save, for the panel and the routes.
import {
  check,
  describeChange,
  price,
  type Brief,
  type ChatMessage,
  type CheckResult,
  type Design,
  type Order,
  type Reason,
  type Snapshot,
} from '@cakeshop/shared';
import type { OrderStore } from '../store';
import { assertDesigning } from './status';

export type Clock = () => Date;
export const nowOf = (clock: Clock) => clock().toISOString();
export const todayOf = (clock: Clock) => nowOf(clock).slice(0, 10);

export function addChat(order: Order, msg: Omit<ChatMessage, 'id' | 'at'>, now: string): ChatMessage {
  const full: ChatMessage = { ...msg, id: order.chat.reduce((m, c) => Math.max(m, c.id), 0) + 1, at: now };
  order.chat.push(full);
  return full;
}

export type ChangeBy = 'assistant' | 'choose' | 'panel';
export type ChangeResult = { ok: true; order: Order } | { ok: false; reasons: Reason[] };
export type Staged = { ok: true; change: string } | { ok: false; reasons: Reason[] };

/** The brief and design, the two things both sides change. */
export const snapshot = (o: Order): Snapshot => ({ brief: structuredClone(o.brief), design: o.design ? structuredClone(o.design) : null });
export const sameSnapshot = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);

/** 1 check → 2 price → 3 version + 1 and an event. Nothing changes when the checker says no. */
export function stageChange(order: Order, proposed: Design, by: ChangeBy, clock: Clock, note?: string): Staged {
  const now = nowOf(clock);
  const result = check(proposed, order.brief, todayOf(clock));
  if (!result.ok) return { ok: false, reasons: result.reasons };
  const before = order.design;
  const design: Design = { ...proposed, version: (before?.version ?? 0) + 1 };
  const change = note ?? (before ? describeChange(before, design) : `started from ${design.template}`);
  order.design = design;
  order.quote = price(design, order.brief);
  order.updatedAt = now;
  order.events.push({ at: now, by, type: 'change', text: change || 'no visible change' });
  return { ok: true, change: change || 'no visible change' };
}

/** stageChange, then 4 a `ui` chat note for panel changes, then save. */
export function applyChange(store: OrderStore, order: Order, proposed: Design, by: ChangeBy, clock: Clock, note?: string): ChangeResult {
  assertDesigning(order);
  const r = stageChange(order, proposed, by, clock, note);
  if (!r.ok) return r;
  if (by === 'panel') addChat(order, { kind: 'ui', text: r.change, change: r.change, by: 'customer' }, nowOf(clock));
  store.save(order);
  return { ok: true, order };
}

const BRIEF_FIELDS = ['occasion', 'guests', 'date', 'dietary', 'fulfilment', 'slot'] as const;
export type BriefField = (typeof BRIEF_FIELDS)[number];
export const isBriefField = (f: string): f is BriefField => (BRIEF_FIELDS as readonly string[]).includes(f);

/** A brief change re-runs the checker on the current design and is refused the same way as a design change. */
export function stageBrief(order: Order, next: Brief, by: 'panel' | 'assistant', clock: Clock): Staged {
  const now = nowOf(clock);
  let design = order.design;
  if (design) {
    design = { ...design, glutenFree: next.dietary.includes('gluten-free'), vegan: next.dietary.includes('vegan') };
    const result = check(design, next, todayOf(clock));
    if (!result.ok) return { ok: false, reasons: result.reasons };
  }
  const changes = (Object.keys({ ...order.brief, ...next }) as (keyof Brief)[])
    .filter((k) => JSON.stringify(order.brief[k]) !== JSON.stringify(next[k]))
    .map((k) => `${k} ${stringify(order.brief[k])} → ${stringify(next[k])}`)
    .join('; ');
  order.brief = next;
  if (design) {
    design = { ...design, version: (order.design?.version ?? 0) + 1 };
    order.design = design;
    order.quote = price(design, next);
  }
  order.updatedAt = now;
  order.events.push({ at: now, by, type: 'change', text: `order details: ${changes || 'no change'}` });
  return { ok: true, change: changes || 'no change' };
}

export function applyBriefChange(store: OrderStore, order: Order, next: Brief, clock: Clock): ChangeResult {
  assertDesigning(order);
  const r = stageBrief(order, next, 'panel', clock);
  if (!r.ok) return r;
  addChat(order, { kind: 'ui', text: `Order details: ${r.change}`, change: r.change, by: 'customer' }, nowOf(clock));
  store.save(order);
  return { ok: true, order };
}

const stringify = (v: unknown) => (Array.isArray(v) ? v.join(', ') || 'none' : v === undefined || v === '' ? 'none' : String(v));

export function currentCheck(order: Order, clock: Clock): CheckResult | null {
  return order.design ? check(order.design, order.brief, todayOf(clock)) : null;
}
