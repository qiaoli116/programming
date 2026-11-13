// Undo of one assistant turn (devlog 05 §2): restores the brief and design as they were before the turn, as a new
// version. Only while the order is what that turn left, so a later change is never thrown away silently.
import { check, price, type Order } from '@cakeshop/shared';
import { HttpError } from '../errors';
import type { OrderStore } from '../store';
import { addChat, nowOf, sameSnapshot, snapshot, todayOf, type Clock } from './applyChange';
import { assertDesigning } from './status';

export function undoGroup(store: OrderStore, order: Order, group: string, clock: Clock): Order {
  assertDesigning(order);
  const notes = order.chat.filter((c) => c.kind === 'ui' && c.group === group);
  const first = notes.find((n) => n.undo);
  if (!first?.undo) throw new HttpError(404, 'There is no such change to undo.');
  if (notes.some((n) => n.undone)) throw new HttpError(409, 'That change was already undone.');
  if (!sameSnapshot(snapshot(order), first.undo.after)) {
    throw new HttpError(409, 'The order changed after that, so it can’t be undone in one step. Change it back with the controls.');
  }
  const { before } = first.undo;
  if (before.design) {
    const r = check(before.design, before.brief, todayOf(clock));
    if (!r.ok) throw new HttpError(422, r.reasons[0].text, r.reasons);
  }
  const now = nowOf(clock);
  const what = notes.map((n) => n.change ?? n.text).join('; ');
  order.brief = structuredClone(before.brief);
  order.design = before.design ? { ...structuredClone(before.design), version: (order.design?.version ?? 0) + 1 } : null;
  order.quote = order.design ? price(order.design, order.brief) : null;
  order.updatedAt = now;
  order.lastCustomerAt = now;
  for (const n of notes) n.undone = true;
  order.events.push({ at: now, by: 'customer', type: 'change', text: `undid the assistant's change: ${what}` });
  addChat(order, { kind: 'ui', text: `Undid the assistant's change: ${what}`, change: `undid the assistant's change (${what})`, by: 'customer' }, now);
  store.save(order);
  return order;
}
