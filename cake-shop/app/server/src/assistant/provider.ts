// The seam between the app and "the AI". A provider takes one step of a turn: given the conversation so far (with the
// tool calls and results of this turn), it returns text and/or tool calls. The real provider (anthropic.ts) calls the
// API; the fake is a deterministic script and is what every automated test and demo uses (ASSISTANT_PROVIDER=fake).
import { COLOURS, DECORATIONS, fittingSize, suggestTemplates, template, type Brief } from '@cakeshop/shared';
import type { ProviderInput, ToolResult } from './prompt';
import { REPLY_TOOL } from './tools';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** One step: some text (may be empty) and the tools the model wants to call. No calls means the turn is over. */
export interface Step {
  text: string;
  calls: ToolCall[];
}

export interface AssistantProvider {
  readonly name: string;
  /** Throws when the provider can't answer. */
  step(input: ProviderInput): Promise<Step>;
}

// Tags a test can put in the customer's message to steer the fake:
//   [REJECT]  options include one candidate the checker refuses (on a gluten-free order)
//   [NOPASS]  every candidate, or the change asked for, is refused
//   [PRICE]   the reply text contains prices
//   [FAIL]    the provider throws
//   [LOOP]    keeps calling check_design until it is made to reply
//   [SLOW]    waits a moment before the first step (for "both at once")
const colourIds = COLOURS.map((c) => c.id as string);
const decoIds = DECORATIONS.map((d) => d.id);
export const FAKE_SLOW_MS = 1500;

type Plan = { name: string; input: Record<string, unknown> }[];
type Words = { text: string; cantDo?: string[]; suggestions?: string[] };

function optionsPlan(brief: Brief, said: string): Plan {
  const fits = suggestTemplates(brief);
  const tpls = fits.length ? fits : [template('unicorn-round')!];
  const first = tpls[0];
  const c: Record<string, unknown>[] = [{ title: first.name, note: first.blurb, template: first.id }];
  if (first.id === 'unicorn-round') {
    // The worked example from the design: A plain, B purple with a rainbow drip, C the dinosaur round.
    c.push({ title: 'Purple with a rainbow drip', note: 'A bolder look: purple icing with a rainbow drip.', template: first.id, colour: 'purple', decorations: ['rainbow drip'] });
    const dino = template('dinosaur-round');
    if (dino) c.push({ title: dino.name, note: dino.blurb, template: dino.id });
  } else {
    for (const t of tpls.slice(1, 3)) c.push({ title: t.name, note: t.blurb, template: t.id });
    if (c.length < 2) c.push({ title: 'In pink', note: 'The same cake in pink.', template: first.id, colour: 'pink' });
  }
  // Red velvet is never gluten-free, so on a gluten-free order these fail the checker.
  const bad = (x: Record<string, unknown>) => ({ ...x, sponge: 'red-velvet' });
  if (said.includes('[NOPASS]')) return [{ name: 'propose_options', input: { candidates: c.map(bad) } }];
  if (said.includes('[REJECT]')) return [{ name: 'propose_options', input: { candidates: [c[0], bad({ ...c[0], title: 'Red velvet' })] } }];
  return [{ name: 'propose_options', input: { candidates: c } }];
}

function isoPlusDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** What the fake does for a message: a list of tool calls, or fixed words with no tools. */
function planFor(input: ProviderInput): Plan | Words {
  // Planned from the order as it was when the turn began, so the plan is the same on every step.
  const { design, brief } = input.context.start;
  const today = input.context.today;
  const said = input.context.lastText;
  const t = said.toLowerCase();

  if (/system prompt|ignore your rules/.test(t)) return { text: "I can't share or change how I work, but I'm happy to help with your cake." };
  if (/\bconfirm\b|\bapprove\b/.test(t)) return { text: "I can't confirm or approve orders. When you're happy, use Review & confirm; the baker approves it after that." };
  if (/photo/.test(t)) return { text: "We can't print photos of people. I can add a picture from our library, or your logo, instead.", cantDo: ['Photos of people'], suggestions: ['Add the unicorn picture'] };
  if (/\b3d\b|sculpt/.test(t)) return { text: "We don't make 3D sculpted cakes. A unicorn topper on a round cake is the closest.", cantDo: ['3D sculpted cakes'], suggestions: ['Add a unicorn topper'] };

  const plan: Plan = [];
  const guests = /(-?\d+)\s*(people|guests|of us|kids)\b/.exec(t) ?? /guests to (-?\d+)/.exec(t);
  if (guests) {
    const n = Number(guests[1]);
    plan.push({ name: 'set_brief', input: { field: 'guests', value: n } });
    if (design && n > 0) {
      const fit = fittingSize(design.template, n);
      if (fit !== design.size) plan.push({ name: 'set_design', input: { field: 'size', value: fit } });
    }
  }
  if (/tomorrow/.test(t)) plan.push({ name: 'set_brief', input: { field: 'date', value: isoPlusDays(today, 1) } });
  const day = /for the (\d{1,2})(st|nd|rd|th)/.exec(t);
  if (day) plan.push({ name: 'set_brief', input: { field: 'date', value: `${today.slice(0, 8)}${day[1].padStart(2, '0')}` } });
  if (/deliver/.test(t)) plan.push({ name: 'set_brief', input: { field: 'fulfilment', value: 'delivery' } });
  if (/\bvegan\b/.test(t)) plan.push({ name: 'set_brief', input: { field: 'dietary', value: [...new Set([...brief.dietary, 'vegan'])] } });
  if (design) {
    if (/(3|three)[- ]tier/.test(t)) plan.push({ name: 'set_design', input: { field: 'size', value: '3t80' } });
    if (/red velvet/.test(t)) plan.push({ name: 'set_design', input: { field: 'sponge', value: 'red-velvet' } });
    const colour = /(?:make it|change (?:the )?colou?r to)\s+(\w+)/.exec(t)?.[1];
    if (colour && colourIds.includes(colour)) {
      if (said.includes('[NOPASS]')) plan.push({ name: 'set_design', input: { field: 'sponge', value: 'red-velvet' } });
      else plan.push({ name: 'set_design', input: { field: 'colour', value: colour } });
    }
    if (/\badd\b/.test(t)) {
      const found = decoIds.filter((d) => t.includes(d) && !design.decorations.includes(d));
      if (found.length) plan.push({ name: 'set_design', input: { field: 'decorations', value: [...design.decorations, ...found] } });
    }
  }
  if (plan.length) return plan;
  if (design && /^(what|how|can|do|does|is|are)\b/.test(t.trim())) return { text: 'Yes, I can help with that. What would you like to change?' };
  if (!design) return optionsPlan(brief, said);
  return { text: 'Happy to help. Tell me what you would like to change.' };
}

const reasonOf = (r: ToolResult) => r.text.replace(/^Refused, nothing changed: /, '');

function wordsFromResults(results: ToolResult[]): Words {
  const done = results.filter((r) => r.ok && r.name !== 'propose_options' && r.text.startsWith('Done'));
  const shown = results.some((r) => r.ok && r.name === 'propose_options');
  const refused = results.filter((r) => !r.ok);
  const parts: string[] = [];
  if (shown) parts.push('Here are some ideas.');
  if (done.length) parts.push(`Done: ${done.map((r) => r.text.replace(/^Done: /, '').replace(/\.( Note:.*)?$/, '')).join('; ')}.`);
  if (refused.length && !shown) parts.push(`I can't make that change: ${refused.map(reasonOf).join(' ')}`);
  return { text: parts.join(' ') || 'Done.' };
}

const reply = (w: Words, step: number): Step => ({
  text: '',
  calls: [{ id: `fake-${step}`, name: REPLY_TOOL, input: { text: w.text, cant_do: w.cantDo ?? [], suggestions: w.suggestions ?? [] } }],
});

export class FakeProvider implements AssistantProvider {
  readonly name = 'fake';

  async step(input: ProviderInput): Promise<Step> {
    const { context: ctx } = input;
    const said = ctx.lastText;
    if (said.includes('[FAIL]')) throw new Error('fake provider failure');

    if (input.expect === 'ack') return { text: `Got it: ${ctx.notes.join('; ') || 'no changes'}.`, calls: [] };

    if (ctx.step === 0 && !ctx.retry && said.includes('[SLOW]')) await new Promise((r) => setTimeout(r, FAKE_SLOW_MS));
    if (input.force) return reply({ text: 'I stopped there. Tell me what you would like next.' }, ctx.step);
    if (ctx.retry) return reply({ text: 'You changed the design while I was working, so I left it as you set it.' }, ctx.step);
    if (said.includes('[LOOP]')) return { text: '', calls: [{ id: `fake-${ctx.step}`, name: 'check_design', input: {} }] };

    const plan = planFor(input);
    let words: Words;
    if (Array.isArray(plan)) {
      if (ctx.step < plan.length) return { text: '', calls: [{ id: `fake-${ctx.step}`, ...plan[ctx.step] }] };
      words = wordsFromResults(ctx.results);
    } else words = plan;
    if (said.includes('[PRICE]')) words = { ...words, text: `That one is $45 and the total is $120. ${words.text}` };
    return reply(words, ctx.step);
  }
}
