import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/assistant/prompt';
import { FakeProvider, type AssistantProvider } from '../src/assistant/provider';
import { stripPrices } from '../src/assistant/reply';
import { TurnAssistant } from '../src/assistant/turn';
import { kidsBrief, setup } from './helpers';

const withFake = (provider: AssistantProvider = new FakeProvider()) =>
  setup({ assistant: (store, clock) => new TurnAssistant(store, clock, provider) });

async function start(ctx: ReturnType<typeof setup>, text?: string, template?: string) {
  const res = await ctx.api.post('/api/orders').send({ brief: kidsBrief, text, template });
  return { id: res.body.id as string, token: res.body.token as string, res };
}

describe('an open wish', () => {
  it('gives 2 to 4 checked candidates, each with a quote', async () => {
    const ctx = withFake();
    const { res } = await start(ctx, 'a unicorn cake please');
    expect(res.status).toBe(201);
    const o = res.body.order;
    expect(o.options.length).toBeGreaterThanOrEqual(2);
    expect(o.options.length).toBeLessThanOrEqual(4);
    for (const c of o.options) expect(c.quote.total).toBeGreaterThan(0);
    expect(o.options.map((c: { quote: { total: number } }) => c.quote.total)).toEqual([112, 122, expect.any(Number)]);
    expect(o.chat.at(-1).optionsTurn).toBe(true);
  });
});

describe('the rules decide', () => {
  it('retries a rejected candidate once, then drops it', async () => {
    let calls = 0;
    const inner = new FakeProvider();
    const ctx = withFake({ name: 'spy', turn: (i) => (calls++, inner.turn(i)) });
    const { res } = await start(ctx, 'a unicorn cake [REJECT]');
    expect(calls).toBe(2);
    expect(res.body.order.options.length).toBe(1);
    expect(res.body.order.options.every((c: { design: { sponge: string } }) => c.design.sponge !== 'red-velvet')).toBe(true);
  });
  it('if nothing passes, lists the checker reasons and leaves the design alone', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'make it purple [NOPASS]' });
    expect(r.status).toBe(200);
    expect(r.body.design.version).toBe(1);
    expect(r.body.chat.at(-1).text).toContain("can't make");
    expect(r.body.chat.at(-1).text).toContain('gluten-free');
  });
  it('a refine turn applies the one passing candidate (version + 1)', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'make it purple' });
    expect(r.body.design.colour).toBe('purple');
    expect(r.body.design.version).toBe(2);
  });
  it('removes a price from the reply and logs a warning', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'how much? [PRICE]' });
    expect(r.body.chat.at(-1).text).not.toMatch(/\$\d/);
    expect(ctx.store.get(id)!.events.some((e) => e.type === 'warning')).toBe(true);
  });
  it('stripPrices keeps sentences without money', () => {
    expect(stripPrices('Nice choice. It costs $45. Lovely.')).toEqual({ text: 'Nice choice. Lovely.', removed: ['It costs $45.'] });
  });
});

describe('failures', () => {
  it('a provider failure on a quick change keeps the change and writes the plain ack', async () => {
    const ctx = withFake({ name: 'down', turn: async () => { throw new Error('down'); } });
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const r = await ctx.api.post(`/api/orders/${id}/ack?t=${token}`);
    expect(r.status).toBe(200);
    expect(r.body.design.colour).toBe('purple');
    expect(r.body.chat.at(-1).text).toContain('colour white → purple');
  });
  it('a provider failure on a message answers 502', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'hello [FAIL]' });
    expect(r.status).toBe(502);
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
  it('includes ui notes since the last customer message, and no prices', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'hello there' });
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const input = buildInput(ctx.store.get(id)!, 'reply', () => ctx.time.now);
    expect(input.messages.map((m) => m.content).join('\n')).toContain('[Panel] colour white → purple');
    expect(input.context.notes).toEqual(['colour white → purple']);
    expect(input.system).not.toMatch(/\$\d/);
    expect(input.messages[0].role).toBe('user');
  });
});
