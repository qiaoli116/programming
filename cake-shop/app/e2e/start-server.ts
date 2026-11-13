// Starts the real app for the browser tests: in-memory database, the fake assistant, the real clock.
// POST /__test/reseed gives every test a fresh database with the demo orders.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from '../server/src/app';
import { FakeProvider } from '../server/src/assistant/provider';
import { TurnAssistant } from '../server/src/assistant/turn';
import { OrderStore, createDb } from '../server/src/store';
import { seedOrders } from '../server/seed/orders';

const here = path.dirname(fileURLToPath(import.meta.url));
const clock = () => new Date();
export const PASSWORD = 'e2e-password';

function fresh() {
  const store = new OrderStore(createDb(':memory:'));
  seedOrders(store);
  return createApp({
    store,
    assistant: new TurnAssistant(store, clock, new FakeProvider()),
    clock,
    bakerPassword: PASSWORD,
    webDist: path.resolve(here, '../web/dist'),
  });
}

let current = fresh();
const outer = express();
outer.post('/__test/reseed', (_req, res) => {
  current = fresh();
  res.json({ ok: true });
});
outer.use((req, res, next) => current(req, res, next));
const port = Number(process.env.PORT ?? 3100);
outer.listen(port, () => console.log(`e2e server on http://localhost:${port}`));
