// Runs the real provider on a few messages and prints what the rules made of it. Needs ANTHROPIC_API_KEY in app/.env.
// Usage: npm run live-check -w server
import { config } from '../src/config';
import { TurnAssistant } from '../src/assistant/turn';
import { AnthropicProvider } from '../src/assistant/anthropic';
import { addChat, nowOf } from '../src/orders/applyChange';
import { OrderStore, createDb } from '../src/store';

if (!config.anthropicApiKey) {
  console.error('No ANTHROPIC_API_KEY found. Put a real key in app/.env (see .env.example), then run this again.');
  process.exit(1);
}

const store = new OrderStore(createDb(':memory:'));
const clock = () => new Date();
const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const assistant = new TurnAssistant(store, clock, new AnthropicProvider(config.anthropicApiKey));

const id = store.nextId();
store.insert({
  id,
  token: 'live-check',
  status: 'DESIGNING',
  brief: { occasion: 'kids', guests: 20, date, dietary: ['gluten-free'], fulfilment: 'pickup' },
  chat: [],
  options: [],
  design: null,
  quote: null,
  contact: null,
  approval: null,
  confirmation: null,
  events: [],
  createdAt: nowOf(clock),
  updatedAt: nowOf(clock),
  lastCustomerAt: nowOf(clock),
});

async function say(text: string) {
  const o = store.get(id)!;
  addChat(o, { kind: 'customer', text }, nowOf(clock));
  store.save(o);
  console.log(`\nCustomer: ${text}`);
  await assistant.message(id);
  const after = store.get(id)!;
  console.log(`Assistant: ${after.chat.at(-1)!.text}`);
  for (const c of after.options) console.log(`  option ${c.id}: ${c.title} - ${c.design.colour}, ${c.design.size}, $${c.quote.total}`);
  if (after.design) console.log(`  design: ${after.design.template} ${after.design.colour} v${after.design.version}, $${after.quote?.total}`);
  for (const e of after.events.filter((x) => x.type === 'warning')) console.log(`  WARNING: ${e.text}`);
}

await say('A unicorn cake for my daughter, something sparkly');
const first = store.get(id)!.options[0];
if (first) {
  const o = store.get(id)!;
  o.design = { ...first.design, version: 1 };
  o.quote = first.quote;
  store.save(o);
}
await say('Make it purple please');
await say('Can you do it with a photo of her face?');
await say('How much will it cost?');
