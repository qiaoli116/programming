// The trace (devlog 07): a record of what moved between the parts of the app, per order, for the x-ray window.
// Each event is "something moved from part A to part B". It is kept in memory only (the last events of the last orders),
// is lost on restart, and never goes into the database. Nothing recorded here is read back by the app itself.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Order } from '@cakeshop/shared';

/** The ten boxes of the map. */
export type Part = 'user' | 'studio' | 'api' | 'host' | 'board' | 'designer' | 'tools' | 'checker' | 'llm' | 'db';

/** An event with `from` equal to `to` only changes the map (busy, idle): no dot moves and the console shows no line. */
export interface TraceEvent {
  /** Counts up across all orders, so `after=<seq>` finds only newer events. */
  seq: number;
  /** Milliseconds since 1970 (real time, not the app's clock: this is for watching, not for the rules). */
  at: number;
  from: Part;
  to: Part;
  label: string;
  ms?: number;
  data?: unknown;
  /** The map: this part starts working (glows, with a timer and this word). */
  busy?: { part: Part; label: string };
  /** The map: this part stops working. */
  idle?: Part;
  /** The map: the `to` box flashes green or red. */
  verdict?: 'ok' | 'bad';
}

export type TraceExtra = Partial<Pick<TraceEvent, 'ms' | 'data' | 'busy' | 'idle' | 'verdict'>>;

const MAX_PER_ORDER = 500;
const MAX_ORDERS = 50;
const MAX_DATA_CHARS = 1500;

/** A snapshot of the data as JSON, cut to a sensible size (so a later change to the object can't change the record). */
function snapshotOf(data: unknown): unknown {
  if (data === undefined) return undefined;
  let s: string;
  try {
    s = JSON.stringify(data);
  } catch {
    return String(data);
  }
  if (s === undefined) return undefined;
  return s.length <= MAX_DATA_CHARS ? JSON.parse(s) : `${s.slice(0, MAX_DATA_CHARS)}…`;
}

export class Trace {
  private byOrder = new Map<string, TraceEvent[]>();
  private last = 0;
  private who = new AsyncLocalStorage<Part>();

  /** When it is off, nothing is recorded and the route answers 404 (XRAY=off). */
  constructor(readonly enabled = true) {}

  emit(orderId: string, from: Part, to: Part, label: string, extra: TraceExtra = {}): void {
    if (!this.enabled) return;
    const e: TraceEvent = { seq: ++this.last, at: Date.now(), from, to, label, ...extra };
    if (extra.data !== undefined) e.data = snapshotOf(extra.data);
    let list = this.byOrder.get(orderId);
    if (!list) {
      list = [];
      this.byOrder.set(orderId, list);
      if (this.byOrder.size > MAX_ORDERS) this.byOrder.delete(this.byOrder.keys().next().value as string);
    }
    list.push(e);
    if (list.length > MAX_PER_ORDER) list.splice(0, list.length - MAX_PER_ORDER);
  }

  /** Events newer than `after`, oldest first. */
  since(orderId: string, after = 0): TraceEvent[] {
    return (this.byOrder.get(orderId) ?? []).filter((e) => e.seq > after);
  }

  /** Runs `fn` as this part: saves made inside it are shown as coming from it (the default is the API). */
  as<T>(actor: Part, fn: () => T): T {
    return this.enabled ? this.who.run(actor, fn) : fn();
  }

  get actor(): Part {
    return this.who.getStore() ?? 'api';
  }
}

// ---- What a save changed -----------------------------------------------------------------------------------------

const show = (v: unknown): string => {
  const s = v === null || v === undefined ? 'none' : Array.isArray(v) ? v.join(',') || 'none' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
};

function fieldChanges(a: object | null, b: object | null): Record<string, [unknown, unknown]> {
  const x = (a ?? {}) as Record<string, unknown>;
  const y = (b ?? {}) as Record<string, unknown>;
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out[k] = [x[k] ?? null, y[k] ?? null];
  return out;
}

/**
 * What a save changed, as one short label and the details. Null when nothing the customer or baker would care about
 * changed (only the job's progress, the event log, or a timestamp): the job board lines already show those.
 */
export function describeSave(before: Order, after: Order): { label: string; data: Record<string, unknown> } | null {
  const parts: string[] = [];
  const data: Record<string, unknown> = {};
  if (before.status !== after.status) {
    parts.push(`status ${before.status}→${after.status}`);
    data.status = [before.status, after.status];
  }
  const brief = fieldChanges(before.brief, after.brief);
  for (const [k, [a, b]] of Object.entries(brief)) parts.push(`brief.${k} ${show(a)}→${show(b)}`);
  if (Object.keys(brief).length) data.brief = brief;
  const design = fieldChanges(before.design, after.design);
  for (const [k, [a, b]] of Object.entries(design)) if (k !== 'version') parts.push(`design.${k} ${show(a)}→${show(b)}`);
  if (Object.keys(design).length) data.design = design;
  if (JSON.stringify(before.quote) !== JSON.stringify(after.quote)) {
    parts.push('quote');
    data.quote = { total: [before.quote?.total ?? null, after.quote?.total ?? null] };
  }
  if (JSON.stringify(before.options) !== JSON.stringify(after.options)) parts.push(`options ${after.options.length}`);
  for (const k of ['contact', 'approval', 'confirmation'] as const) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) parts.push(k);
  const chat = after.chat.length - before.chat.length;
  if (chat > 0) {
    parts.push(`chat +${chat}`);
    data.chat = after.chat.slice(-chat).map((c) => ({ kind: c.kind, text: c.text.slice(0, 120) }));
  }
  return parts.length ? { label: `saved ${parts.join(' · ')}`, data } : null;
}
