// One assistant turn (devlog 05). The model calls tools on a working copy of the order, then replies. At the end the
// copy is committed, unless the customer changed the order while the model was working: then the assistant is told,
// tries once more, and if the order moved again its changes are dropped. The AI proposes; the rules decide.
import { check, price, type Candidate, type Order, type OrderEvent, type Snapshot } from '@cakeshop/shared';
import { AssistantFailure } from '../errors';
import { addChat, nowOf, sameSnapshot, snapshot, todayOf, type Clock } from '../orders/applyChange';
import type { OrderStore } from '../store';
import { buildInput, panelNotesSinceAssistant, type Block, type Msg, type ToolResult } from './prompt';
import type { AssistantProvider } from './provider';
import { stripPrices } from './reply';
import { plainAck, type Assistant } from './service';
import { REPLY_TOOL, TOOLS, runTool } from './tools';

/** Tool calls allowed in one turn (not counting reply). After that the model must reply. */
export const MAX_TOOL_CALLS = 6;
const MAX_STEPS = MAX_TOOL_CALLS + 3;

type Words = { text: string; cantDo: string[]; suggestions: string[] };

interface Attempt {
  start: Snapshot;
  /** The highest chat id when the turn began, to find what the customer did meanwhile. */
  lastChatId: number;
  w: Order;
  newEvents: OrderEvent[];
  changes: string[];
  optionsShown: boolean;
  words: Words;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

function readReply(input: Record<string, unknown>): Words {
  return { text: typeof input.text === 'string' ? input.text : '', cantDo: strList(input.cant_do), suggestions: strList(input.suggestions).slice(0, 3) };
}

export class TurnAssistant implements Assistant {
  constructor(
    private store: OrderStore,
    private clock: Clock,
    private provider: AssistantProvider,
  ) {}

  private async step(input: Parameters<AssistantProvider['step']>[0]) {
    try {
      return await this.provider.step(input);
    } catch (err) {
      throw new AssistantFailure(err instanceof Error ? err.message : 'The assistant failed.');
    }
  }

  /** Runs the tool loop on a copy of the stored order. Nothing is saved here. */
  private async attempt(orderId: string, retry: boolean, extra?: string): Promise<Attempt | null> {
    const order = this.store.get(orderId);
    if (!order || order.status !== 'DESIGNING') return null;
    const w = structuredClone(order);
    const firstEvent = w.events.length;
    const base = buildInput(order, 'reply', this.clock, extra);
    const messages: Msg[] = [...base.messages];
    const results: ToolResult[] = [];
    const changes: string[] = [];
    let optionsShown = false;
    let calls = 0;
    let words: Words | null = null;

    for (let step = 0; step < MAX_STEPS && !words; step++) {
      const res = await this.step({
        ...base,
        messages,
        tools: TOOLS,
        force: calls >= MAX_TOOL_CALLS ? REPLY_TOOL : undefined,
        context: { ...base.context, brief: w.brief, design: w.design, step, results, retry },
      });
      if (res.calls.length === 0) {
        words = { text: res.text, cantDo: [], suggestions: [] };
        break;
      }
      const said: Block[] = res.text ? [{ type: 'text', text: res.text }] : [];
      messages.push({ role: 'assistant', content: [...said, ...res.calls.map((c) => ({ type: 'tool_use' as const, ...c }))] });
      const out: Block[] = [];
      for (const call of res.calls) {
        if (call.name === REPLY_TOOL) {
          words = readReply(call.input);
          out.push({ type: 'tool_result', tool_use_id: call.id, content: 'Sent.' });
          continue;
        }
        if (calls >= MAX_TOOL_CALLS) {
          out.push({ type: 'tool_result', tool_use_id: call.id, content: 'Not run: the tool limit for this turn is reached. Call reply now.', is_error: true });
          continue;
        }
        calls++;
        const r = runTool(w, call.name, call.input, this.clock);
        results.push({ name: call.name, input: call.input, ok: r.ok, text: r.text });
        w.events.push({ at: nowOf(this.clock), by: 'assistant', type: 'tool', text: `${call.name} ${JSON.stringify(call.input)} → ${r.ok ? '' : 'refused: '}${r.text.slice(0, 300)}` });
        if (r.change) changes.push(r.change);
        if (r.options) optionsShown = true;
        out.push({ type: 'tool_result', tool_use_id: call.id, content: r.text, ...(r.ok ? {} : { is_error: true }) });
      }
      messages.push({ role: 'user', content: out });
    }
    return {
      start: snapshot(order),
      lastChatId: order.chat.reduce((m, c) => Math.max(m, c.id), 0),
      w,
      newEvents: w.events.slice(firstEvent),
      changes,
      optionsShown,
      words: words ?? { text: '', cantDo: [], suggestions: [] },
    };
  }

  async message(orderId: string): Promise<void> {
    let a = await this.attempt(orderId, false);
    if (!a) return;
    let stored = this.store.get(orderId);
    if (!stored || stored.status !== 'DESIGNING') return;
    let dropped = false;

    // The customer changed the order while the model was working: its changes were made on an old copy.
    if (a.changes.length && !sameSnapshot(snapshot(stored), a.start)) {
      const theirs = stored.chat.filter((c) => c.id > a!.lastChatId && c.kind === 'ui').map((c) => c.change ?? c.text);
      const b = await this.attempt(
        orderId,
        true,
        `(While you were working, the customer changed: ${theirs.join('; ') || 'the order'}. Your changes were not applied. Look at the current order before changing anything.)`,
      );
      stored = this.store.get(orderId);
      if (!b || !stored || stored.status !== 'DESIGNING') return;
      dropped = true;
      a = b;
      if (a.changes.length && !sameSnapshot(snapshot(stored), a.start)) a = { ...a, changes: [], newEvents: a.newEvents.filter((e) => e.type !== 'change') };
    }
    this.commit(stored, a, dropped);
  }

  private commit(stored: Order, a: Attempt, dropped: boolean) {
    const now = nowOf(this.clock);
    const removed: string[] = [];
    const clean = (s: string) => {
      const r = stripPrices(s);
      removed.push(...r.removed);
      return r.text;
    };

    if (a.changes.length) {
      stored.brief = a.w.brief;
      stored.design = a.w.design;
      stored.quote = a.w.quote;
      stored.updatedAt = a.w.updatedAt;
    }
    stored.events.push(...a.newEvents);
    if (dropped) {
      stored.events.push({ at: now, by: 'server', type: 'warning', text: 'The customer changed the order during a turn; the assistant’s changes from that try were not applied.' });
      addChat(stored, { kind: 'system', text: 'You changed the order while the assistant was working, so its changes from that moment were not applied.' }, now);
    }
    if (a.changes.length) {
      const group = `g${stored.chat.reduce((m, c) => Math.max(m, c.id), 0) + 1}`;
      const after = snapshot(stored);
      a.changes.forEach((change, i) =>
        addChat(stored, { kind: 'ui', text: `Assistant changed ${change}`, change, by: 'assistant', group, ...(i === 0 ? { undo: { before: a.start, after } } : {}) }, now),
      );
    }

    let optionsTurn = false;
    if (a.optionsShown) {
      // Checked again against the stored brief, in case it moved, and priced by Pricing.
      const ok = a.w.options.filter((c) => check(c.design, stored.brief, todayOf(this.clock)).ok);
      if (ok.length) {
        stored.options = ok.map<Candidate>((c) => ({ ...c, title: clean(c.title), note: clean(c.note), quote: price(c.design, stored.brief) }));
        optionsTurn = true;
      }
    }

    let text = clean(a.words.text);
    if (!text) text = optionsTurn ? 'Here are some ideas.' : a.changes.length ? `Done: ${a.changes.join('; ')}.` : 'Done.';
    const cantDo = a.words.cantDo.map(clean).filter(Boolean);
    const suggestions = a.words.suggestions.map(clean).filter(Boolean);
    addChat(stored, { kind: 'assistant', text, cantDo, suggestions, ...(optionsTurn ? { optionsTurn: true } : {}) }, now);
    if (removed.length) stored.events.push({ at: now, by: 'server', type: 'warning', text: `Removed a price from the assistant's reply: ${removed.join(' | ')}` });
    this.store.save(stored);
  }

  async ack(orderId: string): Promise<void> {
    const order = this.store.get(orderId);
    if (!order || panelNotesSinceAssistant(order).length === 0) return;
    try {
      const res = await this.step({ ...buildInput(order, 'ack', this.clock), tools: [] });
      const { text: t, removed } = stripPrices(res.text);
      const fresh = this.store.get(orderId)!;
      const now = nowOf(this.clock);
      const total = fresh.quote ? ` Total $${fresh.quote.total}.` : '';
      addChat(fresh, { kind: 'assistant', text: `${t || 'Updated.'}${total}` }, now);
      if (removed.length) fresh.events.push({ at: now, by: 'server', type: 'warning', text: `Removed a price from the assistant's reply: ${removed.join(' | ')}` });
      this.store.save(fresh);
    } catch {
      plainAck(this.store, orderId, this.clock);
    }
  }
}
