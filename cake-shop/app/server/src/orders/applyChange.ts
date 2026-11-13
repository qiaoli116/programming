// The live loop (devlog 04 §5). Every change to the design goes through here, whoever makes it.
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

/**
 * 1 check → 2 price → 3 save (version + 1, event) → 4 a `ui` chat note for panel changes.
 * Nothing is saved when the checker says no.
 */
export function applyChange(store: OrderStore, order: Order, proposed: Design, by: ChangeBy, clock: Clock, note?: string): ChangeResult {
  assertDesigning(order);
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
  if (by === 'panel') addChat(order, { kind: 'ui', text: change, change }, now);
  store.save(order);
  return { ok: true, order };
}

const BRIEF_FIELDS = ['occasion', 'guests', 'date', 'dietary', 'fulfilment', 'slot'] as const;
export type BriefField = (typeof BRIEF_FIELDS)[number];
export const isBriefField = (f: string): f is BriefField => (BRIEF_FIELDS as readonly string[]).includes(f);

/** A brief change re-runs the checker on the current design and is refused the same way as a quick change. */
export function applyBriefChange(store: OrderStore, order: Order, next: Brief, clock: Clock): ChangeResult {
  assertDesigning(order);
  const now = nowOf(clock);
  let design = order.design;
  if (design) {
    design = { ...design, glutenFree: next.dietary.includes('gluten-free'), vegan: next.dietary.includes('vegan') };
    const result = check(design, next, todayOf(clock));
    if (!result.ok) return { ok: false, reasons: result.reasons };
  }
  const changes = (Object.keys(next) as (keyof Brief)[])
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
  order.events.push({ at: now, by: 'panel', type: 'change', text: `order details: ${changes}` });
  addChat(order, { kind: 'ui', text: `Order details: ${changes}`, change: changes }, now);
  store.save(order);
  return { ok: true, order };
}

const stringify = (v: unknown) => (Array.isArray(v) ? v.join(', ') || 'none' : v === undefined || v === '' ? 'none' : String(v));

export function currentCheck(order: Order, clock: Clock): CheckResult | null {
  return order.design ? check(order.design, order.brief, todayOf(clock)) : null;
}
