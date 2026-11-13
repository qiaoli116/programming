import request from 'supertest';
import type { Brief } from '@cakeshop/shared';
import { createApp } from '../src/app';
import { PlainAssistant, type Assistant } from '../src/assistant/service';
import { OrderStore, createDb } from '../src/store';

export const PASSWORD = 'test-password';

export const kidsBrief: Brief = { occasion: 'kids', guests: 20, date: '2026-11-21', dietary: ['gluten-free'], fulfilment: 'pickup' };

export function setup(opts: { assistant?: (store: OrderStore, clock: () => Date) => Assistant } = {}) {
  const db = createDb(':memory:');
  const store = new OrderStore(db);
  const time = { now: new Date('2026-11-13T09:00:00.000Z') };
  const clock = () => time.now;
  const assistant = opts.assistant ? opts.assistant(store, clock) : new PlainAssistant(store, clock);
  const app = createApp({ store, assistant, clock, bakerPassword: PASSWORD });
  return { app, store, time, api: request(app) };
}

export type Ctx = ReturnType<typeof setup>;

/** Creates an order that already has the Unicorn round as its design. */
export async function startUnicorn(ctx: Ctx, brief: Brief = kidsBrief) {
  const res = await ctx.api.post('/api/orders').send({ brief, template: 'unicorn-round' });
  return { id: res.body.id as string, token: res.body.token as string, res };
}

export async function bakerCookie(ctx: Ctx): Promise<string> {
  const res = await ctx.api.post('/api/baker/login').send({ password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

export const contact = { name: 'Jordan', phone: '(555) 010-0143', email: 'jordan@example.com' };
