// Starts the real app for the browser tests: in-memory database, the fake assistant, the real clock.
// POST /__test/reseed gives every test a fresh database with the demo orders.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from '../server/src/app';
import { FakeProvider } from '../server/src/assistant/provider';
import { TeamAssistant } from '../server/src/assistant/team';
import { OrderStore, createDb } from '../server/src/store';
import { Trace } from '../server/src/trace';
import { seedOrders } from '../server/seed/orders';

const here = path.dirname(fileURLToPath(import.meta.url));
const clock = () => new Date();
export const PASSWORD = 'e2e-password';

let store: OrderStore;
function fresh() {
  const trace = new Trace(true);
  store = new OrderStore(createDb(':memory:'), trace);
  seedOrders(store);
  return createApp({
    store,
    assistant: new TeamAssistant(store, clock, new FakeProvider(), trace),
    clock,
    bakerPassword: PASSWORD,
    trace,
    webDist: path.resolve(here, '../web/dist'),
  });
}

let current = fresh();
const outer = express();
outer.post('/__test/reseed', (_req, res) => {
  current = fresh();
  res.json({ ok: true });
});
// Moves an order's last customer activity back by ?days=N, so the abandon sweep can be tested on the real clock.
outer.post('/__test/age/:id', (req, res) => {
  const o = store.get(req.params.id);
  if (!o) return void res.status(404).json({ error: 'no order' });
  const days = Number(req.query.days ?? 8);
  o.lastCustomerAt = new Date(Date.now() - days * 86400000).toISOString();
  store.save(o);
  res.json({ ok: true });
});
outer.use((req, res, next) => current(req, res, next));
const port = Number(process.env.PORT ?? 3100);
outer.listen(port, () => console.log(`e2e server on http://localhost:${port}`));
