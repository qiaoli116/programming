import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@cakeshop/shared';
import { buildInput, type ProviderInput } from '../src/assistant/prompt';
import { FakeProvider, type AssistantProvider } from '../src/assistant/provider';
import { stripPrices } from '../src/assistant/reply';
import { MAX_TOOL_CALLS, TurnAssistant } from '../src/assistant/turn';
import { kidsBrief, setup, type Ctx } from './helpers';

const withFake = (provider: AssistantProvider = new FakeProvider()) =>
  setup({ assistant: (store, clock) => new TurnAssistant(store, clock, provider) });

/** A provider that records every step it is asked for and passes it on to the fake. */
function spy() {
  const inner = new FakeProvider();
  const inputs: ProviderInput[] = [];
  return { inputs, provider: { name: 'spy', step: (i: ProviderInput) => (inputs.push(structuredClone(i)), inner.step(i)) } };
}

async function start(ctx: Ctx, text?: string, template?: string) {
  const res = await ctx.api.post('/api/orders').send({ brief: kidsBrief, text, template });
  return { id: res.body.id as string, token: res.body.token as string, res };
}
const say = (ctx: Ctx, id: string, token: string, text: string) => ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text });
const assistantNotes = (chat: ChatMessage[]) => chat.filter((c) => c.kind === 'ui' && c.by === 'assistant');

describe('an open wish', () => {
  it('shows 2 to 4 checked option cards, each with a quote', async () => {
    const ctx = withFake();
    const { res } = await start(ctx, 'a unicorn cake please');
    expect(res.status).toBe(201);
    const o = res.body.order;
    expect(o.options.map((c: { quote: { total: number } }) => c.quote.total)).toEqual([112, 122, expect.any(Number)]);
    expect(o.chat.at(-1).optionsTurn).toBe(true);
    expect(o.design).toBeNull();
  });
  it('only cards that pass the checker are shown', async () => {
    const ctx = withFake();
    const { res } = await start(ctx, 'a unicorn cake [REJECT]');
    expect(res.body.order.options.length).toBe(1);
    expect(res.body.order.options.every((c: { design: { sponge: string } }) => c.design.sponge !== 'red-velvet')).toBe(true);
  });
});

describe('the agent loop', () => {
  it('sends each tool result back to the model before it replies', async () => {
    const s = spy();
    const ctx = withFake(s.provider);
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    s.inputs.length = 0;
    await say(ctx, id, token, 'make it purple');
    expect(s.inputs.map((i) => i.context.step)).toEqual([0, 1]);
    const second = JSON.stringify(s.inputs[1].messages.at(-1));
    expect(second).toContain('tool_result');
    expect(second).toContain('colour white');
    expect(s.inputs[0].tools.map((t) => t.name)).toContain('set_brief');
    expect(s.inputs[0].tools.map((t) => t.name)).not.toContain('confirm');
  });
  it('a design change goes through the checker and is noted as the assistant’s, with Undo', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it purple');
    expect(r.body.design.colour).toBe('purple');
    expect(r.body.design.version).toBe(2);
    const [note] = assistantNotes(r.body.chat);
    expect(note.change).toBe('colour white → purple');
    expect(note.group).toBeTruthy();
    expect(note.undo!.before.design!.colour).toBe('white');
  });
  it('"only 10 people" sets the guests and re-fits the size, in one undoable group', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    expect(ctx.store.get(id)!.design!.size).toBe('10in');
    const r = await say(ctx, id, token, "actually it's only 10 people");
    expect(r.body.brief.guests).toBe(10);
    expect(r.body.design.size).toBe('8in');
    const notes = assistantNotes(r.body.chat);
    expect(notes.map((n) => n.change)).toEqual(['guests 20 → 10', expect.stringContaining('size')]);
    expect(new Set(notes.map((n) => n.group)).size).toBe(1);

    const u = await ctx.api.post(`/api/orders/${id}/undo?t=${token}`).send({ group: notes[0].group });
    expect(u.status).toBe(200);
    expect(u.body.brief.guests).toBe(20);
    expect(u.body.design.size).toBe('10in');
    expect(u.body.design.version).toBe(r.body.design.version + 1);
    expect(assistantNotes(u.body.chat).every((n) => n.undone)).toBe(true);
    const again = await ctx.api.post(`/api/orders/${id}/undo?t=${token}`).send({ group: notes[0].group });
    expect(again.status).toBe(409);
  });
  it('Undo is refused once the order changed after that turn', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it purple');
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'pink' });
    const u = await ctx.api.post(`/api/orders/${id}/undo?t=${token}`).send({ group: assistantNotes(r.body.chat)[0].group });
    expect(u.status).toBe(409);
  });
  it('a refused change leaves the order alone and the reply gives the reason', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it red velvet');
    expect(r.body.design.version).toBe(1);
    expect(r.body.chat.at(-1).text).toContain("can't make");
    expect(r.body.chat.at(-1).text).toMatch(/gluten/i);
    expect(assistantNotes(r.body.chat)).toEqual([]);
    expect(ctx.store.get(id)!.events.some((e) => e.type === 'tool' && e.text.includes('refused'))).toBe(true);
  });
  it('guests -3 is refused by the same validation as the panel', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'set the guests to -3');
    expect(r.body.brief.guests).toBe(20);
    expect(r.body.design.version).toBe(1);
  });
  it(`stops after ${MAX_TOOL_CALLS} tool calls and still replies`, async () => {
    const s = spy();
    const ctx = withFake(s.provider);
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    s.inputs.length = 0;
    const r = await say(ctx, id, token, 'keep checking [LOOP]');
    expect(r.status).toBe(200);
    expect(ctx.store.get(id)!.events.filter((e) => e.type === 'tool').length).toBe(MAX_TOOL_CALLS);
    expect(s.inputs.at(-1)!.force).toBe('reply');
    expect(r.body.chat.at(-1).kind).toBe('assistant');
  });
  it('cannot confirm the order: there is no tool for it', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'confirm my order for me');
    expect(r.body.status).toBe('DESIGNING');
    expect(r.body.design.version).toBe(1);
  });
});

describe('both at once', () => {
  it('a panel change during a turn wins; the assistant is told and its changes are not applied', async () => {
    const s = spy();
    const ctx = withFake(s.provider);
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    s.inputs.length = 0;
    const turn = say(ctx, id, token, 'make it pink [SLOW]').then((r) => r);
    await new Promise((r) => setTimeout(r, 300));
    const panel = await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    expect(panel.status).toBe(200);
    const r = await turn;
    expect(r.body.design.colour).toBe('purple');
    expect(r.body.chat.some((c: ChatMessage) => c.kind === 'system' && c.text.includes('not applied'))).toBe(true);
    expect(assistantNotes(r.body.chat)).toEqual([]);
    expect(s.inputs.some((i) => i.context.retry && JSON.stringify(i.messages).includes('colour white → purple'))).toBe(true);
  });
});

describe('prices', () => {
  it('removes a price from the reply and logs a warning', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'how much? [PRICE]');
    expect(r.body.chat.at(-1).text).not.toMatch(/\$\d/);
    expect(ctx.store.get(id)!.events.some((e) => e.type === 'warning')).toBe(true);
  });
  it('stripPrices keeps sentences without money', () => {
    expect(stripPrices('Nice choice. It costs $45. Lovely.')).toEqual({ text: 'Nice choice. Lovely.', removed: ['It costs $45.'] });
  });
});

describe('failures', () => {
  const down: AssistantProvider = { name: 'down', step: async () => { throw new Error('down'); } };
  it('a provider failure on a quick change keeps the change and writes the plain ack', async () => {
    const ctx = withFake(down);
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const r = await ctx.api.post(`/api/orders/${id}/ack?t=${token}`);
    expect(r.status).toBe(200);
    expect(r.body.design.colour).toBe('purple');
    expect(r.body.chat.at(-1).text).toContain('colour white → purple');
  });
  it('a provider failure on a message answers 502 and changes nothing', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'hello [FAIL]');
    expect(r.status).toBe(502);
    expect(ctx.store.get(id)!.design!.version).toBe(1);
  });
  it('the fake ack echoes the quick changes', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const r = await ctx.api.post(`/api/orders/${id}/ack?t=${token}`);
    expect(r.body.chat.at(-1).text).toContain('colour white → purple');
  });
});

describe('the prompt', () => {
  it('has panel notes, the assistant’s own changes, and no prices', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await say(ctx, id, token, 'make it pink');
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const input = buildInput(ctx.store.get(id)!, 'reply', () => ctx.time.now);
    const all = input.messages.map((m) => m.content).join('\n');
    expect(all).toContain('(I changed: colour white → pink)');
    expect(all).toContain('[Panel] colour pink → purple');
    expect(input.context.notes).toEqual(['colour pink → purple']);
    expect(input.system).not.toMatch(/\$\d/);
    expect(input.messages[0].role).toBe('user');
  });
});
