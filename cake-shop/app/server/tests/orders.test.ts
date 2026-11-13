import { describe, expect, it } from 'vitest';
import { seedOrders } from '../seed/orders';
import { sweepAbandoned } from '../src/orders/status';
import { bakerCookie, contact, kidsBrief, setup, startUnicorn } from './helpers';

describe('creating an order', () => {
  it('returns a token and DESIGNING for a valid brief', async () => {
    const ctx = setup();
    const res = await ctx.api.post('/api/orders').send({ brief: kidsBrief });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('C-1046');
    expect(res.body.token.length).toBeGreaterThan(30);
    expect(res.body.order.status).toBe('DESIGNING');
    expect(res.body.order.token).toBeUndefined();
    expect(res.body.order.events).toBeUndefined();
  });
  it('refuses less than 2 days of notice and a bad brief', async () => {
    const ctx = setup();
    const soon = await ctx.api.post('/api/orders').send({ brief: { ...kidsBrief, date: '2026-11-14' } });
    expect(soon.status).toBe(422);
    expect(soon.body.reasons[0].code).toBe('notice');
    const bad = await ctx.api.post('/api/orders').send({ brief: { ...kidsBrief, guests: 0 } });
    expect(bad.status).toBe(400);
  });
  it('starts from a template: the design is checked, priced and versioned', async () => {
    const ctx = setup();
    const { res } = await startUnicorn(ctx);
    expect(res.body.order.design.template).toBe('unicorn-round');
    expect(res.body.order.design.size).toBe('10in');
    expect(res.body.order.design.version).toBe(1);
    expect(res.body.order.quote.total).toBe(112);
    expect(res.body.order.check).toEqual({ ok: true });
  });
});

describe('quick changes and brief changes', () => {
  it('a quick change that passes saves version + 1 and appends a ui note', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    const res = await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    expect(res.status).toBe(200);
    expect(res.body.design.colour).toBe('purple');
    expect(res.body.design.version).toBe(2);
    const note = res.body.chat.at(-1);
    expect(note.kind).toBe('ui');
    expect(note.change).toBe('colour white → purple');
  });
  it('a quick change that fails returns 422 with reasons and changes nothing', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    const res = await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'sponge', value: 'red-velvet' });
    expect(res.status).toBe(422);
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toContain('gf_red_velvet');
    const after = await ctx.api.get(`/api/orders/${id}?t=${token}`);
    expect(after.body.design.sponge).toBe('vanilla');
    expect(after.body.design.version).toBe(1);
  });
  it('the ack endpoint writes one plain acknowledgement for several quick changes', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'decorations', value: ['rainbow drip'] });
    const res = await ctx.api.post(`/api/orders/${id}/ack?t=${token}`);
    const last = res.body.chat.at(-1);
    expect(last.kind).toBe('assistant');
    expect(last.text).toContain('colour white → purple');
    expect(last.text).toContain('Total $122');
  });
  it('a brief change that breaks the current design is refused', async () => {
    const ctx = setup();
    const b = { ...kidsBrief, dietary: [] as string[] };
    const { id, token } = await startUnicorn(ctx, b as typeof kidsBrief);
    await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'sponge', value: 'red-velvet' });
    const res = await ctx.api.patch(`/api/orders/${id}/brief?t=${token}`).send({ field: 'dietary', value: ['gluten-free'] });
    expect(res.status).toBe(422);
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toContain('gf_red_velvet');
  });
  it('a brief change that passes updates the price', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    const res = await ctx.api.patch(`/api/orders/${id}/brief?t=${token}`).send({ field: 'fulfilment', value: 'delivery' });
    expect(res.status).toBe(200);
    expect(res.body.quote.total).toBe(122);
  });
  it('choose makes a candidate the current design', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    const order = ctx.store.get(id)!;
    order.options = [{ id: 7, title: 'Purple drip', note: '', design: { ...order.design!, colour: 'purple', decorations: ['rainbow drip'] }, quote: { lines: [], total: 0 } }];
    ctx.store.save(order);
    const res = await ctx.api.post(`/api/orders/${id}/choose?t=${token}`).send({ candidate: 7 });
    expect(res.status).toBe(200);
    expect(res.body.design.colour).toBe('purple');
    expect(res.body.quote.total).toBe(122);
  });
});

describe('confirm', () => {
  const body = { fulfilment: 'pickup', slot: '10-12', contact, final: true };
  it('needs final: true', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    const res = await ctx.api.post(`/api/orders/${id}/confirm?t=${token}`).send({ ...body, final: false });
    expect(res.status).toBe(400);
  });
  it('re-checks notice, freezes the design and sets AWAITING_BAKER', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    ctx.time.now = new Date('2026-11-19T09:00:00.000Z'); // two days before pickup: a round needs 3
    const late = await ctx.api.post(`/api/orders/${id}/confirm?t=${token}`).send(body);
    expect(late.status).toBe(422);
    expect(late.body.reasons[0].code).toBe('notice');
    ctx.time.now = new Date('2026-11-14T09:00:00.000Z');
    const ok = await ctx.api.post(`/api/orders/${id}/confirm?t=${token}`).send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('AWAITING_BAKER');
    expect(ok.body.contact.name).toBe('Jordan');
    expect(ok.body.notices[0].text).toContain('jordan@example.com');
  });
  it('after confirm, design and brief changes return 409', async () => {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    await ctx.api.post(`/api/orders/${id}/confirm?t=${token}`).send(body);
    const d = await ctx.api.patch(`/api/orders/${id}/design?t=${token}`).send({ field: 'colour', value: 'purple' });
    const b = await ctx.api.patch(`/api/orders/${id}/brief?t=${token}`).send({ field: 'guests', value: 10 });
    expect(d.status).toBe(409);
    expect(b.status).toBe(409);
  });
});

describe('baker', () => {
  const body = { fulfilment: 'pickup', slot: '10-12', contact, final: true };
  async function confirmed() {
    const ctx = setup();
    const { id, token } = await startUnicorn(ctx);
    await ctx.api.post(`/api/orders/${id}/confirm?t=${token}`).send(body);
    return { ctx, id, token, cookie: await bakerCookie(ctx) };
  }
  it('approve sets CONFIRMED and writes the confirmation; the customer sees it', async () => {
    const { ctx, id, token, cookie } = await confirmed();
    const res = await ctx.api.post(`/api/baker/orders/${id}/approve`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const view = await ctx.api.get(`/api/orders/${id}?t=${token}`);
    expect(view.body.status).toBe('CONFIRMED');
    expect(view.body.confirmation).toMatchObject({ paid: 'simulated', amount: 112 });
    const again = await ctx.api.post(`/api/baker/orders/${id}/approve`).set('Cookie', cookie);
    expect(again.status).toBe(409);
  });
  it('decline needs a reason, and the customer sees it', async () => {
    const { ctx, id, token, cookie } = await confirmed();
    const none = await ctx.api.post(`/api/baker/orders/${id}/decline`).set('Cookie', cookie).send({ reason: '  ' });
    expect(none.status).toBe(400);
    const ok = await ctx.api.post(`/api/baker/orders/${id}/decline`).set('Cookie', cookie).send({ reason: 'The kitchen is fully booked that day.' });
    expect(ok.status).toBe(200);
    const view = await ctx.api.get(`/api/orders/${id}?t=${token}`);
    expect(view.body.status).toBe('DECLINED');
    expect(view.body.approval.reason).toBe('The kitchen is fully booked that day.');
  });
  it('a wrong token answers 404, baker routes without the cookie answer 401', async () => {
    const { ctx, id } = await confirmed();
    expect((await ctx.api.get(`/api/orders/${id}?t=nope`)).status).toBe(404);
    expect((await ctx.api.get(`/api/orders/${id}`)).status).toBe(404);
    expect((await ctx.api.get('/api/orders/C-9999?t=x')).status).toBe(404);
    expect((await ctx.api.get('/api/baker/orders')).status).toBe(401);
    expect((await ctx.api.post(`/api/baker/orders/${id}/approve`)).status).toBe(401);
    expect((await ctx.api.post('/api/baker/login').send({ password: 'wrong' })).status).toBe(401);
  });
  it('the list is sorted by pickup date, and the same-bake-day list is right', async () => {
    const ctx = setup();
    seedOrders(ctx.store);
    const cookie = await bakerCookie(ctx);
    const list = await ctx.api.get('/api/baker/orders?status=waiting').set('Cookie', cookie);
    expect(list.body.orders.map((o: { id: string }) => o.id)).toEqual(['C-1045', 'C-1043', 'C-1044']);
    expect(list.body.counts).toEqual({ waiting: 3, approved: 2, declined: 0 });
    const detail = await ctx.api.get('/api/baker/orders/C-1043').set('Cookie', cookie);
    expect(detail.body.bakeDay).toBe('2026-11-20');
    expect(detail.body.sameDay.map((o: { id: string }) => o.id).sort()).toEqual(['C-1041', 'C-1042']);
    expect(detail.body.check).toEqual({ ok: true });
    expect(detail.body.order.token).toBeUndefined();
    expect(detail.body.order.events.length).toBeGreaterThan(0);
  });
  it('the seed prices Jordan at $112 and new orders continue at C-1046', async () => {
    const ctx = setup();
    expect(seedOrders(ctx.store)).toBe(5);
    expect(seedOrders(ctx.store)).toBe(0);
    expect(ctx.store.get('C-1043')!.quote!.total).toBe(112);
    expect(ctx.store.nextId()).toBe('C-1046');
  });
});

describe('the abandon sweep', () => {
  it('abandons an order idle for 7 days, not one idle for 6', async () => {
    const ctx = setup();
    const a = await startUnicorn(ctx);
    ctx.time.now = new Date('2026-11-19T09:00:00.000Z');
    expect(sweepAbandoned(ctx.store, ctx.time.now.toISOString())).toBe(0);
    expect(ctx.store.get(a.id)!.status).toBe('DESIGNING');
    ctx.time.now = new Date('2026-11-20T09:00:00.000Z');
    expect(sweepAbandoned(ctx.store, ctx.time.now.toISOString())).toBe(1);
    expect(ctx.store.get(a.id)!.status).toBe('ABANDONED');
  });
  it("doesn't touch orders that were already sent to the baker", async () => {
    const ctx = setup();
    seedOrders(ctx.store);
    expect(sweepAbandoned(ctx.store, '2027-01-01T00:00:00.000Z')).toBe(0);
  });
});
