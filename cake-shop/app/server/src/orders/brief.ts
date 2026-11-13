// Reads and validates the order details (the brief). Used by the routes and by the assistant's set_brief tool.
import { OCCASIONS, SHOP, SLOTS, daysBetween, type Brief, type Dietary } from '@cakeshop/shared';
import { HttpError } from '../errors';

const DIETARY: Dietary[] = ['gluten-free', 'vegan'];
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function parseBrief(raw: unknown, today: string): Brief {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (!OCCASIONS.some((o) => o.id === b.occasion)) throw new HttpError(400, 'Choose an occasion.');
  const guests = Number(b.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 500) throw new HttpError(400, 'Guests must be a whole number from 1 to 500.');
  if (!isDate(b.date)) throw new HttpError(400, 'Choose a pickup or delivery date.');
  const dietary = Array.isArray(b.dietary) ? b.dietary : [];
  if (!dietary.every((d) => DIETARY.includes(d as Dietary))) throw new HttpError(400, 'Unknown dietary need.');
  const fulfilment = b.fulfilment ?? 'pickup';
  if (fulfilment !== 'pickup' && fulfilment !== 'delivery') throw new HttpError(400, 'Fulfilment is pickup or delivery.');
  const slot = b.slot === undefined || b.slot === '' || b.slot === null ? undefined : String(b.slot);
  if (slot && !SLOTS.some((s) => s.id === slot)) throw new HttpError(400, 'Unknown time slot.');
  const brief: Brief = { occasion: b.occasion as Brief['occasion'], guests, date: b.date, dietary: [...new Set(dietary as Dietary[])], fulfilment, slot };
  assertNotice(brief.date, today);
  return brief;
}

export function assertNotice(date: string, today: string) {
  const days = daysBetween(today, date);
  if (days < SHOP.minNoticeDays) {
    throw new HttpError(422, `We need at least ${SHOP.minNoticeDays} days' notice.`, [
      { code: 'notice', field: 'date', level: 'shop', text: `We need at least ${SHOP.minNoticeDays} days' notice. The date you chose is ${Math.max(days, 0)} day${days === 1 ? '' : 's'} away.` },
    ]);
  }
}
