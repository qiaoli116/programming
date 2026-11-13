// One assistant turn: ask the provider, check every candidate with the rules, retry once with the reasons,
// keep only what passes, strip prices. The AI proposes; the rules decide.
import { check, price, type AssistantReply, type Candidate, type Order, type Reason } from '@cakeshop/shared';
import { AssistantFailure } from '../errors';
import { addChat, applyChange, nowOf, todayOf, type Clock } from '../orders/applyChange';
import type { OrderStore } from '../store';
import { buildInput, type Expect } from './prompt';
import type { AssistantProvider } from './provider';
import { parseReply, stripPrices } from './reply';
import { plainAck, type Assistant } from './service';

type Checked = { reply: AssistantReply; passed: AssistantReply['candidates']; reasons: Reason[] };

export class TurnAssistant implements Assistant {
  constructor(
    private store: OrderStore,
    private clock: Clock,
    private provider: AssistantProvider,
  ) {}

  private async ask(order: Order, expect: Expect, reasons: Reason[] = []): Promise<AssistantReply> {
    let raw: unknown;
    try {
      raw = await this.provider.turn(buildInput(order, expect, this.clock, reasons));
    } catch (err) {
      throw new AssistantFailure(err instanceof Error ? err.message : 'The assistant failed.');
    }
    try {
      return parseReply(raw, order.brief);
    } catch (err) {
      throw new AssistantFailure(err instanceof Error ? err.message : 'Bad reply.');
    }
  }

  private checkAll(order: Order, reply: AssistantReply): Checked {
    const passed: AssistantReply['candidates'] = [];
    const reasons: Reason[] = [];
    for (const c of reply.candidates) {
      const r = check(c.design, order.brief, todayOf(this.clock));
      if (r.ok) passed.push(c);
      else reasons.push(...r.reasons);
    }
    return { reply, passed, reasons };
  }

  async message(orderId: string): Promise<void> {
    const first = this.store.get(orderId);
    if (!first) return;
    let reply = await this.ask(first, 'reply');
    let res = this.checkAll(first, reply);
    const need = reply.kind === 'options' ? 2 : reply.kind === 'refine' ? 1 : 0;
    if (need && res.passed.length < need) {
      try {
        const again = await this.ask(first, 'reply', res.reasons);
        const second = this.checkAll(first, again);
        if (second.passed.length >= res.passed.length) {
          reply = again;
          res = second;
        }
      } catch {
        // keep the first result
      }
    }

    // The provider takes time; quick changes may have happened meanwhile, so work on the stored order.
    const order = this.store.get(orderId);
    if (!order || order.status !== 'DESIGNING') return;
    const now = nowOf(this.clock);
    const removed: string[] = [];
    const clean = (s: string) => {
      const r = stripPrices(s);
      removed.push(...r.removed);
      return r.text;
    };
    let text = clean(reply.text);
    const cantDo = reply.cantDo.map(clean).filter(Boolean);
    const suggestions = reply.suggestions.map(clean).filter(Boolean);

    const proposes = reply.kind === 'options' || reply.kind === 'refine';
    let optionsTurn = false;
    if (proposes && res.passed.length === 0) {
      const why = [...new Map(res.reasons.map((r) => [r.text, r])).values()].map((r) => r.text).join(' ');
      text = `I can't make that one: ${why || 'it breaks a shop rule.'} Your design stays as it is.`;
    } else if (reply.kind === 'refine') {
      const done = applyChange(this.store, order, res.passed[0].design, 'assistant', this.clock);
      if (!done.ok) text = `I can't make that change: ${done.reasons.map((r) => r.text).join(' ')}`;
    } else if (reply.kind === 'options') {
      let id = order.options.reduce((m, o) => Math.max(m, o.id), 0);
      order.options = res.passed.slice(0, 4).map<Candidate>((c) => ({
        id: ++id,
        title: clean(c.title),
        note: clean(c.note),
        design: { ...c.design, version: 0 },
        quote: price(c.design, order.brief),
      }));
      optionsTurn = true;
    }
    if (!text) text = reply.kind === 'options' ? 'Here are some ideas.' : 'Done.';

    const target = this.store.get(orderId)!;
    if (optionsTurn) target.options = order.options;
    addChat(target, { kind: 'assistant', text, cantDo, suggestions, ...(optionsTurn ? { optionsTurn: true } : {}) }, now);
    if (removed.length) target.events.push({ at: now, by: 'server', type: 'warning', text: `Removed a price from the assistant's reply: ${removed.join(' | ')}` });
    this.store.save(target);
  }

  async ack(orderId: string): Promise<void> {
    const order = this.store.get(orderId);
    if (!order || !order.chat.some((c) => c.kind === 'ui')) return;
    try {
      const reply = await this.ask(order, 'ack');
      const { text: t, removed } = stripPrices(reply.text);
      const fresh = this.store.get(orderId)!;
      const now = nowOf(this.clock);
      const total = fresh.quote ? ` Total $${fresh.quote.total}.` : '';
      addChat(fresh, { kind: 'assistant', text: `${t || 'Updated.'}${total}`, cantDo: reply.cantDo, suggestions: reply.suggestions }, now);
      if (removed.length) fresh.events.push({ at: now, by: 'server', type: 'warning', text: `Removed a price from the assistant's reply: ${removed.join(' | ')}` });
      this.store.save(fresh);
    } catch {
      plainAck(this.store, orderId, this.clock);
    }
  }
}
