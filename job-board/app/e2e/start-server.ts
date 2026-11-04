// Starts the whole app for the end-to-end tests: Express serving the built React files,
// on an in-memory database loaded with the seed data (test plan section 4).
// Match scoring uses the offline FakeProvider, so no key or network is needed.
// Adds one test-only route, /__test/reseed, so every test starts from the same data.
import path from 'node:path';
import express from 'express';
import { createApp } from '../server/src/app';
import { createDb, migrate } from '../server/src/db/knex';
import { FakeProvider } from '../server/src/scoring/provider';
import { seedDatabase } from '../server/seed/seed';

const port = Number(process.env.E2E_PORT ?? 3100);

const db = createDb(':memory:');
await migrate(db);
await seedDatabase(db, { rounds: 4 });

const server = express();
server.post('/__test/reseed', async (_req, res) => {
  await seedDatabase(db, { rounds: 4 });
  res.json({ ok: true });
});
server.use(createApp({ db, scoring: new FakeProvider(), webDist: path.resolve(import.meta.dirname, '../web/dist') }));
server.listen(port, () => console.log(`E2E server on http://localhost:${port}`));
