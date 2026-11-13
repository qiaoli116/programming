// The x-ray trace (devlog 07): what the server records for the x-ray window, and what it must never record.
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/assistant/provider';
import { TeamAssistant } from '../src/assistant/team';
import { Trace, type TraceEvent } from '../src/trace';
import { contact, setup, startUnicorn, type Ctx } from './helpers';

const withFake = (opts: { xray?: boolean } = {}) =>
  setup({ ...opts, assistant: (store, clock, trace) => new TeamAssistant(store, clock, new FakeProvider(), trace) });

const line = (e: TraceEvent) => `${e.from}>${e.to} ${e.label}`;
const lines = (ctx: Ctx, id: string, after = 0) => ctx.trace.since(id, after).map(line);

/** True when the lines contain these starts, in this order (other lines may come between). */
function inOrder(all: string[], wanted: string[]): boolean {
  let at = 0;
  for (const w of wanted) {
    const i = all.findIndex((l, n) => n >= at && l.startsWith(w));
    if (i < 0) return false;
    at = i + 1;
  }
  return true;
}

async function tenPeople(ctx: Ctx) {
  const { id, token } = await startUnicorn(ctx);
  await ctx.assistant.idle(id);
  const after = ctx.trace.since(id).at(-1)?.seq ?? 0;
  await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: "actually it's only 10 people" });
  await ctx.assistant.idle(id);
  return { id, token, after };
}

describe('the trace of "actually it\'s only 10 people"', () => {
  it('has the parts in order: the user, the host, the job board, the designer, the checker, the database and the report', async () => {
    const ctx = withFake();
    const { id, after } = await tenPeople(ctx);
    const all = lines(ctx, id, after);
    expect(
      inOrder(all, [
        'user>studio sends "actually it\'s only 10 people"',
        'studio>api POST /orders/' + id + '/messages',
        'api>host message(' + id + ')',
        'host>llm step → fake-host',
        'llm>host ← ask_designer, reply',
        'host>board job 1 queued',
        'board>designer job 1 working',
        'designer>llm step → fake-designer',
        'llm>designer ← set_brief',
        'designer>tools set_brief {"field":"guests","value":10}',
        'tools>checker ✓',
        'designer>board job 1 progress: guests 20 → 10',
        'designer>db saved brief.guests 20→10',
        'designer>board job 1 reporting',
        'board>host job 1 report',
        'host>llm step → fake-host',
        'host>board job 1 done',
        'api>studio 200',
      ]),
    ).toBe(true);
  });

  it('marks the map: the host, the LLM and the designer are busy and then idle, and the checker has a verdict', async () => {
    const ctx = withFake();
    const { id, after } = await tenPeople(ctx);
    const events = ctx.trace.since(id, after);
    for (const part of ['host', 'llm', 'designer', 'api'] as const) {
      const marks = events.filter((e) => e.busy?.part === part || e.idle === part);
      expect(marks.length, part).toBeGreaterThanOrEqual(2);
      expect(marks.at(-1)!.idle, `${part} ends idle`).toBe(part);
    }
    expect(events.filter((e) => e.to === 'checker').every((e) => e.verdict === 'ok' || e.verdict === 'bad')).toBe(true);
  });

  it('shows the data of the model step, the tool call and the save', async () => {
    const ctx = withFake();
    const { id, after } = await tenPeople(ctx);
    const events = ctx.trace.since(id, after);
    const host = events.find((e) => e.label === '← ask_designer, reply')!;
    expect(host.ms).toBeGreaterThanOrEqual(0);
    expect((host.data as { calls: { name: string }[] }).calls.map((c) => c.name)).toEqual(['ask_designer', 'reply']);
    expect(events.find((e) => e.label.startsWith('set_brief'))!.data).toEqual({ input: { field: 'guests', value: 10 } });
    expect(events.find((e) => e.label.startsWith('saved brief.guests'))!.data).toMatchObject({ brief: { guests: [20, 10] }, quote: { total: expect.any(Array) } });
  });

  it('numbers events in order, and `after` returns only the newer ones', async () => {
    const ctx = withFake();
    const { id } = await tenPeople(ctx);
    const all = ctx.trace.since(id);
    expect(all.map((e) => e.seq)).toEqual([...all.map((e) => e.seq)].sort((a, b) => a - b));
    const mid = all[Math.floor(all.length / 2)].seq;
    expect(ctx.trace.since(id, mid).every((e) => e.seq > mid)).toBe(true);
    expect(ctx.trace.since(id, all.at(-1)!.seq)).toEqual([]);
  });

  it('says so when the checker refuses a change', async () => {
    const ctx = withFake();
    const { id, token } = await startUnicorn(ctx);
    await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'make it purple [NOPASS]' });
    await ctx.assistant.idle(id);
    const refused = ctx.trace.since(id).find((e) => e.to === 'checker' && e.verdict === 'bad');
    expect(refused?.label.startsWith('✗')).toBe(true);
  });
});

describe('the trace route', () => {
  it('answers with the events and the last seq, and with only newer ones after `after`', async () => {
    const ctx = withFake();
    const { id, token } = await tenPeople(ctx);
    const res = await ctx.api.get(`/api/orders/${id}/trace?t=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(10);
    expect(res.body.last).toBe(res.body.events.at(-1).seq);
    const none = await ctx.api.get(`/api/orders/${id}/trace?t=${token}&after=${res.body.last}`);
    expect(none.body).toEqual({ events: [], last: res.body.last });
  });

  it('needs the order token: a wrong or missing one answers 404', async () => {
    const ctx = withFake();
    const { id } = await tenPeople(ctx);
    expect((await ctx.api.get(`/api/orders/${id}/trace?t=wrong`)).status).toBe(404);
    expect((await ctx.api.get(`/api/orders/${id}/trace`)).status).toBe(404);
  });

  it('does not record its own polling', async () => {
    const ctx = withFake();
    const { id, token } = await tenPeople(ctx);
    const before = ctx.trace.since(id).length;
    await ctx.api.get(`/api/orders/${id}/trace?t=${token}`);
    await ctx.api.get(`/api/orders/${id}/trace?t=${token}`);
    expect(ctx.trace.since(id).length).toBe(before);
  });
});

describe('what is never recorded', () => {
  it('the order token, the baker password and the contact details', async () => {
    const ctx = withFake();
    const { id, token } = await startUnicorn(ctx);
    await ctx.api.post(`/api/orders/${id}/messages?t=${token}`).send({ text: 'add a rainbow drip' });
    await ctx.assistant.idle(id);
    ctx.time.now = new Date('2026-11-14T09:00:00.000Z');
    const ok = await ctx.api.post(`/api/orders/${id}/confirm?t=${token}`).send({ fulfilment: 'pickup', slot: '10-12', contact, final: true });
    expect(ok.status).toBe(200);
    const text = JSON.stringify((await ctx.api.get(`/api/orders/${id}/trace?t=${token}`)).body);
    expect(text).toContain('confirms the final design');
    for (const secret of [token, contact.email, contact.phone, 'test-password']) expect(text).not.toContain(secret);
  });

  it('requests for an order that is not there, or with a wrong token', async () => {
    const ctx = withFake();
    const { id } = await startUnicorn(ctx);
    const before = ctx.trace.since(id).length;
    await ctx.api.post('/api/orders/C-9999/messages?t=x').send({ text: 'hello' });
    await ctx.api.post(`/api/orders/${id}/messages?t=wrong`).send({ text: 'hello' });
    expect(ctx.trace.since('C-9999')).toEqual([]);
    expect(ctx.trace.since(id).length).toBe(before);
  });

  it('a save that changed only the job board or a timestamp', async () => {
    const ctx = withFake();
    const { id } = await startUnicorn(ctx);
    const before = ctx.trace.since(id).length;
    const o = ctx.store.get(id)!;
    o.updatedAt = '2026-11-14T00:00:00.000Z';
    ctx.store.save(o);
    expect(ctx.trace.since(id).length).toBe(before);
  });
});

describe('XRAY=off', () => {
  it('records nothing, and the trace route answers 404', async () => {
    const ctx = withFake({ xray: false });
    const { id, token } = await tenPeople(ctx);
    expect(ctx.trace.since(id)).toEqual([]);
    expect((await ctx.api.get(`/api/orders/${id}/trace?t=${token}`)).status).toBe(404);
  });

  it('the health check says whether the x-ray is on', async () => {
    expect((await withFake().api.get('/api/health')).body).toEqual({ ok: true, xray: true });
    expect((await withFake({ xray: false }).api.get('/api/health')).body).toEqual({ ok: true, xray: false });
  });
});

describe('the recorder', () => {
  it('keeps the last 500 events of an order, and only the last 50 orders', () => {
    const t = new Trace();
    for (let i = 0; i < 520; i++) t.emit('C-1', 'api', 'db', `e${i}`);
    expect(t.since('C-1').length).toBe(500);
    expect(t.since('C-1')[0].label).toBe('e20');
    for (let n = 0; n < 60; n++) t.emit(`O-${n}`, 'api', 'db', 'x');
    expect(t.since('C-1')).toEqual([]);
    expect(t.since('O-59').length).toBe(1);
  });

  it('keeps a copy of the data, cut to a sensible size', () => {
    const t = new Trace();
    const data = { a: 1 };
    t.emit('C-1', 'api', 'db', 'x', { data });
    data.a = 2;
    expect(t.since('C-1')[0].data).toEqual({ a: 1 });
    t.emit('C-1', 'api', 'db', 'big', { data: { text: 'x'.repeat(5000) } });
    expect(String(t.since('C-1')[1].data).length).toBeLessThan(1600);
  });
});
