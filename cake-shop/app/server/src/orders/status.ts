// Status moves are checked in one place. Any other move is an error.
import { SHOP, type Order, type Status } from '@cakeshop/shared';
import type { OrderStore } from '../store';
import { HttpError } from '../errors';

const MOVES: Record<Status, Status[]> = {
  DESIGNING: ['AWAITING_BAKER', 'ABANDONED'],
  AWAITING_BAKER: ['CONFIRMED', 'DECLINED'],
  CONFIRMED: [],
  DECLINED: [],
  ABANDONED: [],
};

export function canMove(from: Status, to: Status): boolean {
  return MOVES[from].includes(to);
}

export function moveStatus(order: Order, to: Status, now: string, by: 'customer' | 'baker' | 'server', text: string): void {
  if (!canMove(order.status, to)) throw new HttpError(409, `An order that is ${order.status} can't become ${to}.`);
  order.events.push({ at: now, by, type: 'status', text: `${order.status} → ${to}. ${text}`.trim() });
  order.status = to;
  order.updatedAt = now;
}

/** Writing to a draft column (design, brief, chat from the customer) is allowed only while DESIGNING. */
export function assertDesigning(order: Order): void {
  if (order.status !== 'DESIGNING') throw new HttpError(409, 'This order has been sent to the baker and can no longer be changed.');
}

/** Orders with no customer activity for 7 days are abandoned. Returns how many moved. */
export function sweepAbandoned(store: OrderStore, now: string): number {
  const limit = new Date(now).getTime() - SHOP.abandonDays * 86400000;
  let n = 0;
  for (const o of store.list(['DESIGNING'])) {
    if (new Date(o.lastCustomerAt).getTime() <= limit) {
      moveStatus(o, 'ABANDONED', now, 'server', `No customer activity for ${SHOP.abandonDays} days.`);
      store.save(o);
      n++;
    }
  }
  return n;
}
