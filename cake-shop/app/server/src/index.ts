import path from 'node:path';
import { createApp } from './app';
import { createAssistant } from './assistant/factory';
import { config } from './config';
import { OrderStore, createDb } from './store';
import { Trace } from './trace';

const db = createDb(config.dbFile);
const trace = new Trace(config.xray);
const store = new OrderStore(db, trace);
const clock = () => new Date();

if (config.seedOnStart && store.count() === 0) {
  const { seedOrders } = await import('../seed/orders');
  console.log(`Empty database: loaded ${seedOrders(store)} demo orders`);
}

const assistant = createAssistant(store, clock, config, trace);
console.log(`Design assistant: ${config.assistantProvider === 'fake' ? 'fake (offline)' : config.anthropicApiKey ? 'Anthropic API' : 'not configured (plain replies)'}`);
const app = createApp({
  store,
  assistant,
  clock,
  bakerPassword: config.bakerPassword,
  sessionHours: config.sessionHours,
  secureCookie: config.secureCookie,
  trace,
  webDist: path.resolve(process.cwd(), process.env.WEB_DIST ?? '../web/dist'),
});
app.listen(config.port, () => {
  console.log(`Cake shop listening on http://localhost:${config.port}  (database: ${config.dbFile})`);
});
