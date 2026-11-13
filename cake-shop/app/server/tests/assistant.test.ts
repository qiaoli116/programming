import { describe, expect, it } from 'vitest';
import type { ChatMessage, OrderView } from '@cakeshop/shared';
import { hostInput, type ProviderInput } from '../src/assistant/prompt';
import { FakeProvider, type AssistantProvider } from '../src/assistant/provider';
import { stripPrices } from '../src/assistant/reply';
import { MAX_TOOL_CALLS, TeamAssistant } from '../src/assistant/team';
import { kidsBrief, setup, type Ctx } from './helpers';

const withFake = (provider: AssistantProvider = new FakeProvider()) =>
  setup({ assistant: (store, clock) => new TeamAssistant(store, clock, provider) });

/** A provider that records every step it is asked for and passes it on to the fake. */
function spy() {
  const inner = new FakeProvider();
  const inputs: ProviderInput[] = [];
  return { inputs, provider: { name: 'spy', step: (i: ProviderInput) => (inputs.push(structuredClone(i)), inner.step(i)) } };
}
const designerSteps = (inputs: ProviderInput[]) => inputs.filter((i) => i.agent === 'designer');

const view = async (ctx: Ctx, id: string, token: string) => (await ctx.api.get(`/api/orders/${id}?t=${token}`)).body as OrderView;

/** Starts an order and waits for the designer to finish. `res` is the immediate answer. */
async function start(ctx: Ctx, text?: string, template?: string) {
  const res = await ctx.api.post('/api/orders').send({ brief: kidsBrief, text, template });
  const id = res.body.id as string;
  const token = res.body.token as string;
  await ctx.assistant.idle(id);
  return { id, token, res, order: await view(ctx, id, token) };
}

/** Sends a message. `now` is the host's immediate answer; `body` the order once the board has settled. */
async function say(ctx: Ctx, id: string, token: string, text: string) {
  const now = await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text });
  await ctx.assistant.idle(id);
  return { status: now.status, now: now.body as OrderView, body: await view(ctx, id, token) };
}
const assistantNotes = (chat: ChatMessage[]) => chat.filter((c) => c.kind === 'ui' && c.by === 'assistant');
const handoffs = (chat: ChatMessage[]) => chat.filter((c) => c.kind === 'handoff').map((c) => `${c.from}:${c.job}`);

describe('an open wish', () => {
  it('the designer shows 2 to 4 checked option cards, each with a quote, and the host presents them', async () => {
    const ctx = withFake();
    const { res, order: o } = await start(ctx, 'a unicorn cake please');
    expect(res.status).toBe(201);
    expect(o.options.map((c) => c.quote.total)).toEqual([112, 122, expect.any(Number)]);
    expect(o.chat.at(-1)!.optionsTurn).toBe(true);
    expect(o.chat.at(-1)!.from).toBe('host');
    expect(o.design).toBeNull();
    expect(handoffs(o.chat)).toEqual(['host:1', 'designer:1']);
    expect(o.jobs[0]).toMatchObject({ id: 1, status: 'done', task: 'a unicorn cake please' });
    expect(o.jobs[0].progress).toContain('3 option cards ready');
  });
  it('only cards that pass the checker are shown', async () => {
    const ctx = withFake();
    const { order } = await start(ctx, 'a unicorn cake [REJECT]');
    expect(order.options.length).toBe(1);
    expect(order.options.every((c) => c.design.sponge !== 'red-velvet')).toBe(true);
  });
});

describe('option cards in one job', () => {
  it('a second propose_options adds to the cards already shown, up to 4', async () => {
    const fake = new FakeProvider();
    const card = (title: string, extra: Record<string, unknown> = {}) => ({ title, note: 'n', template: 'unicorn-round', ...extra });
    const designer = [
      { name: 'propose_options', input: { candidates: [card('Plain'), card('Red velvet', { sponge: 'red-velvet' })] } },
      { name: 'propose_options', input: { candidates: [card('Purple', { colour: 'purple' })] } },
      { name: 'report', input: { summary: '2 cards in all.', questions: [], suggestions: [] } },
    ];
    const results: string[] = [];
    const provider: AssistantProvider = {
      name: 'cards',
      step: async (i) => {
        if (i.agent !== 'designer') return fake.step(i);
        const last = i.messages.at(-1) as { content: unknown };
        if (Array.isArray(last.content)) results.push(JSON.stringify(last.content));
        const s = i.context.step;
        return { text: '', calls: [{ id: `c${s}`, ...designer[s] }] };
      },
    };
    const ctx = withFake(provider);
    const { order } = await start(ctx, 'some ideas please');
    expect(order.options.map((c) => c.title)).toEqual(['Plain', 'Purple']);
    expect(results.at(-1)).toContain('1 new card(s) shown, 2 in all.');
    expect(order.chat.find((c) => c.optionsTurn)).toBeTruthy();
  });
});

describe('two agents', () => {
  it('the host answers at once and queues a job; the designer works after', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it purple');
    expect(r.now.busy).toBe(true);
    expect(r.now.design!.colour).toBe('white');
    expect(r.now.chat.at(-1)).toMatchObject({ kind: 'handoff', from: 'host', text: 'make it purple' });
    expect(r.now.chat.at(-2)).toMatchObject({ kind: 'assistant', from: 'host', text: "On it, I've asked our designer." });
    expect(r.now.jobs.at(-1)!.status).toMatch(/queued|working/);

    expect(r.body.busy).toBe(false);
    expect(r.body.design!.colour).toBe('purple');
    expect(r.body.jobs.at(-1)).toMatchObject({ status: 'done', progress: ['colour white → purple'] });
    expect(r.body.jobs.at(-1)!.report!.changes).toEqual(['colour white → purple']);
    expect(r.body.chat.at(-1)).toMatchObject({ kind: 'assistant', from: 'host', text: 'Done: colour white → purple.' });
  });
  it('the host answers what it can itself, with no job', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'can you print a photo of my daughter?');
    expect(r.now.busy).toBe(false);
    expect(r.body.jobs).toEqual([]);
    expect(r.body.chat.at(-1)!.cantDo).toEqual(['Photos of people']);
  });
  it('the host sees the board: while a job runs it says what the designer is doing', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'make it purple [SLOW]' });
    const ask = await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'how is it going?' });
    expect(ask.body.busy).toBe(true);
    expect(ask.body.chat.at(-1).text).toContain('Still on it');
    expect(ask.body.jobs.length).toBe(1);
    await ctx.assistant.idle(id);
    expect((await view(ctx, id, token)).design!.colour).toBe('purple');
  });
  it('jobs run one at a time, in order', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'make it purple [SLOW]' });
    await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'make it pink' });
    await ctx.assistant.idle(id);
    const o = await view(ctx, id, token);
    expect(o.design!.colour).toBe('pink');
    expect(o.jobs.map((j) => [j.id, j.status, j.progress])).toEqual([
      [1, 'done', ['colour white → purple']],
      [2, 'done', ['colour purple → pink']],
    ]);
    expect(handoffs(o.chat)).toEqual(['host:1', 'host:2', 'designer:1', 'designer:2']);
  });
  it('an open job older than 2 minutes shows as failed', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const o = ctx.store.get(id)!;
    o.jobs.push({ id: 1, task: 'make it purple', status: 'working', progress: [], createdAt: '2026-11-13T08:57:00.000Z' });
    ctx.store.save(o);
    const v = await view(ctx, id, token);
    expect(v.busy).toBe(false);
    expect(v.jobs[0].status).toBe('failed');
  });
});

describe('the designer', () => {
  it('sends each tool result back to the model before it reports', async () => {
    const s = spy();
    const ctx = withFake(s.provider);
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    s.inputs.length = 0;
    await say(ctx, id, token, 'make it purple');
    const d = designerSteps(s.inputs);
    expect(d.map((i) => i.context.step)).toEqual([0, 1]);
    const second = JSON.stringify(d[1].messages.at(-1));
    expect(second).toContain('tool_result');
    expect(second).toContain('colour white');
    expect(d[0].tools.map((t) => t.name)).toContain('set_brief');
    expect(d[0].tools.map((t) => t.name)).toContain('report');
    expect(d[0].tools.map((t) => t.name)).not.toContain('reply');
    expect(d[0].tools.map((t) => t.name)).not.toContain('confirm');
    const host = s.inputs.find((i) => i.agent === 'host' && i.expect === 'reply')!;
    expect(host.tools.map((t) => t.name)).toEqual(['ask_designer', 'reply']);
  });
  it('a design change goes through the checker and is noted as the designer’s, with Undo', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it purple');
    expect(r.body.design!.colour).toBe('purple');
    expect(r.body.design!.version).toBe(2);
    const [note] = assistantNotes(r.body.chat);
    expect(note.change).toBe('colour white → purple');
    expect(note.group).toBeTruthy();
    expect(note.job).toBe(1);
    expect(note.undo!.before.design!.colour).toBe('white');
  });
  it('"only 10 people" sets the guests and re-fits the size, in one undoable group', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    expect(ctx.store.get(id)!.design!.size).toBe('10in');
    const r = await say(ctx, id, token, "actually it's only 10 people");
    expect(r.body.brief.guests).toBe(10);
    expect(r.body.design!.size).toBe('8in');
    const notes = assistantNotes(r.body.chat);
    expect(notes.map((n) => n.change)).toEqual(['guests 20 → 10', expect.stringContaining('size')]);
    expect(new Set(notes.map((n) => n.group)).size).toBe(1);

    const u = await ctx.api.post(`/api/orders/${id}/undo?t=${token}`).send({ group: notes[0].group });
    expect(u.status).toBe(200);
    expect(u.body.brief.guests).toBe(20);
    expect(u.body.design.size).toBe('10in');
    expect(u.body.design.version).toBe(r.body.design!.version! + 1);
    expect(assistantNotes(u.body.chat).every((n) => n.undone)).toBe(true);
    const again = await ctx.api.post(`/api/orders/${id}/undo?t=${token}`).send({ group: notes[0].group });
    expect(again.status).toBe(409);
  });
  it('Undo is refused once the order changed after that job', async () => {
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
    expect(r.body.design!.version).toBe(1);
    expect(r.body.chat.at(-1)!.text).toContain("can't make");
    expect(r.body.chat.at(-1)!.text).toMatch(/gluten/i);
    expect(assistantNotes(r.body.chat)).toEqual([]);
    expect(r.body.jobs[0].progress[0]).toMatch(/^refused: .*gluten/i);
    expect(ctx.store.get(id)!.events.some((e) => e.type === 'tool' && e.text.includes('refused'))).toBe(true);
  });
  it('guests -3 is refused by the same validation as the panel', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'set the guests to -3');
    expect(r.body.brief.guests).toBe(20);
    expect(r.body.design!.version).toBe(1);
  });
  it(`stops after ${MAX_TOOL_CALLS} tool calls and still reports`, async () => {
    const s = spy();
    const ctx = withFake(s.provider);
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    s.inputs.length = 0;
    const r = await say(ctx, id, token, 'keep checking [LOOP]');
    expect(r.status).toBe(200);
    expect(ctx.store.get(id)!.events.filter((e) => e.type === 'tool').length).toBe(MAX_TOOL_CALLS);
    expect(designerSteps(s.inputs).at(-1)!.force).toBe('report');
    expect(r.body.jobs[0].status).toBe('done');
    expect(r.body.chat.at(-1)!.kind).toBe('assistant');
  });
  it('cannot confirm the order: there is no tool for it', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'confirm my order for me');
    expect(r.body.status).toBe('DESIGNING');
    expect(r.body.design!.version).toBe(1);
  });
});

describe('both at once', () => {
  it('a panel change during a job wins; the designer is told and its changes are not applied', async () => {
    const s = spy();
    const ctx = withFake(s.provider);
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    s.inputs.length = 0;
    await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'make it pink [SLOW]' });
    await new Promise((r) => setTimeout(r, 300));
    const panel = await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    expect(panel.status).toBe(200);
    await ctx.assistant.idle(id);
    const o = await view(ctx, id, token);
    expect(o.design!.colour).toBe('purple');
    expect(o.chat.some((c) => c.kind === 'system' && c.text.includes('not applied'))).toBe(true);
    expect(assistantNotes(o.chat)).toEqual([]);
    expect(o.jobs[0].report!.dropped).toBe(true);
    expect(s.inputs.some((i) => i.agent === 'designer' && i.context.retry && JSON.stringify(i.messages).includes('colour white → purple'))).toBe(true);
  });
});

describe('prices', () => {
  it('removes a price from the reply and logs a warning', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'how much? [PRICE]');
    expect(r.body.chat.at(-1)!.text).not.toMatch(/\$\d/);
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
  it('the host failing on a message answers 502 and queues nothing', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it purple [FAIL]');
    expect(r.status).toBe(502);
    expect(ctx.store.get(id)!.design!.version).toBe(1);
    expect(ctx.store.get(id)!.jobs).toEqual([]);
  });
  it('the designer failing marks the job failed, commits nothing, and the host says so', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it purple [JOBFAIL]');
    expect(r.status).toBe(200);
    expect(r.body.design!.colour).toBe('white');
    expect(r.body.jobs[0].status).toBe('failed');
    expect(r.body.busy).toBe(false);
    expect(r.body.chat.at(-1)!.text).toContain("couldn't finish");
  });
  it('the host failing on the report leaves the changes and writes a plain note', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    const r = await say(ctx, id, token, 'make it purple [REPORTFAIL]');
    expect(r.body.design!.colour).toBe('purple');
    expect(r.body.jobs[0].status).toBe('done');
    expect(r.body.chat.at(-1)!.text).toBe('Done: colour white → purple.');
  });
  it('the fake ack echoes the quick changes', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const r = await ctx.api.post(`/api/orders/${id}/ack?t=${token}`);
    expect(r.body.chat.at(-1).text).toContain('colour white → purple');
  });
});

describe('the host prompt', () => {
  it('has the handoffs, panel notes, the designer’s changes, the board, and no prices', async () => {
    const ctx = withFake();
    const { id, token } = await start(ctx, undefined, 'unicorn-round');
    await say(ctx, id, token, 'make it pink');
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const input = hostInput(ctx.store.get(id)!, 'reply', () => ctx.time.now);
    const all = input.messages.map((m) => m.content).join('\n');
    expect(all).toContain('(I asked the designer, job 1: make it pink)');
    expect(all).toContain('[Designer → host, job 1]');
    expect(all).toContain('(Designer changed: colour white → pink)');
    expect(all).toContain('[Panel] colour pink → purple');
    expect(input.context.notes).toEqual(['colour pink → purple']);
    expect(input.system).toContain('Job 1 (done): make it pink');
    expect(input.system).not.toMatch(/\$\d/);
    expect(input.messages[0].role).toBe('user');
  });
});
