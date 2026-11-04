import path from 'node:path';
import { createApp } from './app';
import { config } from './config';
import { createDb, migrate } from './db/knex';
import { AnthropicProvider } from './scoring/anthropicProvider';
import { FakeProvider, type ScoringProvider } from './scoring/provider';

async function main() {
  const db = createDb(config.dbFile);
  await migrate(db);
  if (config.seedOnStart && !(await db('users').first())) {
    const { seedDatabase } = await import('../seed/seed');
    console.log('Empty database: loading demo data', await seedDatabase(db));
  }
  let scoring: ScoringProvider | undefined;
  if (config.scoringProvider === 'fake') scoring = new FakeProvider();
  else if (config.anthropicApiKey) scoring = new AnthropicProvider(config.anthropicApiKey);
  console.log(`Match scoring: ${scoring ? (config.scoringProvider === 'fake' ? 'fake provider' : 'Claude Haiku 5.5') : 'not configured (no API key)'}`);
  const app = createApp({
    db,
    scoring,
    sessionDays: config.sessionDays,
    secureCookie: config.secureCookie,
    webDist: path.resolve(process.cwd(), process.env.WEB_DIST ?? '../web/dist'),
  });
  app.listen(config.port, () => {
    console.log(`Job board listening on http://localhost:${config.port}  (database: ${config.dbFile})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
