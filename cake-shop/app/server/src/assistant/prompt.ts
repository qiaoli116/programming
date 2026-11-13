// Builds what the provider receives: the system prompt (catalog without prices, rules, how to use the tools), the
// chat, and a structured context that the fake provider reads. The prompt gives the AI no prices, on purpose.
import {
  COLOURS,
  DECORATIONS,
  EXTRAS,
  FILLINGS,
  FINISHES,
  LINES,
  PICTURES,
  SLOTS,
  SPONGES,
  TOPPERS,
  VEGAN_SPONGES,
  OCCASIONS,
  occasion,
  sizeWarning,
  templatesFor,
  type Brief,
  type Design,
  type Agent,
  type ChatMessage,
  type Job,
  type Order,
  type Snapshot,
} from '@cakeshop/shared';
import { todayOf, type Clock } from '../orders/applyChange';
import { boardText, shownJob } from './jobs';
import type { ToolDef } from './tools';

/** reply: the host answers a message. ack: the host acknowledges panel changes. report: the host relays a job's report. work: the designer does a job. */
export type Expect = 'reply' | 'ack' | 'report' | 'work';

/** Message content in the shape the Anthropic API uses, so the real provider can pass it straight through. */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: 'user' | 'assistant'; content: string | Block[] };

export interface ToolResult {
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  text: string;
}

export interface ProviderInput {
  agent: Agent;
  expect: Expect;
  system: string;
  messages: Msg[];
  /** The tools on offer. Empty for an acknowledgement. */
  tools: ToolDef[];
  /** When set, the model must call this tool now (the tool-call limit was reached). */
  force?: string;
  /** Structured copy of the same facts, for the fake provider (the real one reads the prompt). */
  context: {
    brief: Brief;
    design: Design | null;
    today: string;
    /** The host: the customer's last message. The designer: its task. */
    lastText: string;
    notes: string[];
    /** Which step of the turn this is (0 = the first call), and the tool results so far in this turn. */
    step: number;
    results: ToolResult[];
    /** True on the second try after the customer changed the order mid-turn. */
    retry: boolean;
    /** The brief and design when the turn began (brief and design above follow the tool calls). */
    start: Snapshot;
    /** The job board as shown (stale jobs resolved). */
    jobs: Job[];
    /** The job being worked on (designer) or reported (host). */
    job?: Job;
  };
}

const list = (items: { id: string; label: string }[]) => items.map((i) => `${i.id} (${i.label})`).join(', ');

function catalogText(brief: Brief): string {
  const lines = LINES.map(
    (l) =>
      `- ${l.id}: ${l.name}. Sizes: ${l.sizes.map((s) => `${s.id} = ${s.label}, serves ${s.serves}`).join('; ')}. Minimum notice ${l.noticeDays} days` +
      `${l.sizes.some((s) => s.noticeDays) ? ' (3 tiers: 14 days)' : ''}. Groups: ${l.groups.join(', ')}. Decorations at most ${l.maxDecorations}.` +
      ` Message ${l.messageMax ? `up to ${l.messageMax} characters` : 'not available'}. Gluten-free: ${l.glutenFree ? 'yes' : 'no'}. Vegan: ${l.vegan ? 'yes' : 'no'}.`,
  ).join('\n');
  const templates = templatesFor(brief.occasion)
    .map(
      (t) =>
        `- ${t.id} (${t.name}, line ${t.line}): ${t.blurb} Fixed: ${JSON.stringify(t.fixed)}. The customer may change: ${t.changeable.join(', ')}.` +
        `${t.palette ? ` Colours: ${t.palette.join(', ')} only.` : ''} Starts as ${JSON.stringify(t.defaults)}.`,
    )
    .join('\n');
  return `PRODUCT LINES\n${lines}\n\nTEMPLATES FOR THIS OCCASION (${occasion(brief.occasion).label})\n${templates || '(none)'}\n\nOPTIONS\n` +
    `occasion: ${list(OCCASIONS)}\n` +
    `sponge: ${list(SPONGES)} (vegan: ${VEGAN_SPONGES.join(' or ')} only; red velvet is never gluten-free or vegan)\n` +
    `filling: ${list(FILLINGS)}\nfinish: ${list(FINISHES)} (fondant: round and tiered only)\n` +
    `colour: ${list(COLOURS)}\ndecorations: ${list(DECORATIONS)} (drips: round, tiered, mini only)\n` +
    `topper: ${list(TOPPERS)} (not on number cakes or sheets)\npicture: ${list(PICTURES)} (round and sheet only; never photos of people)\n` +
    `extras: ${list(EXTRAS)}\ntime slots: ${list(SLOTS)}\n`;
}

const SHOP_RULES = `HOW THE SHOP WORKS
- The order is a shared workspace: the customer changes it with the panel controls, the designer changes it with tools, and everyone sees every change. The customer can undo the designer's changes.
- A separate rule checker validates every change. A separate pricing function sets every price. NEVER write a price, an amount of money, a discount or a total. If asked about cost, the price shows next to the design and updates by itself.
- Nobody on the team can confirm, pay for, approve or decline an order. The customer confirms with "Review & confirm"; the baker approves.
- We never make: 3D sculpted shapes, likenesses of real people (sculpted or printed), more than 3 tiers, cakes with alcohol, delivery outside the local area, orders with less than 2 days' notice.`;

function orderText(order: Order, clock: Clock): string {
  const b = order.brief;
  const warning = order.design ? sizeWarning(order.design, b) : null;
  return `ORDER DETAILS
occasion: ${b.occasion}; guests: ${b.guests}; date: ${b.date} (today is ${todayOf(clock)}); dietary: ${b.dietary.join(', ') || 'none'}; ${b.fulfilment}${b.slot ? `, slot ${b.slot}` : ''}
CURRENT DESIGN: ${order.design ? JSON.stringify({ ...order.design, version: undefined }) : 'none yet'}
${warning ? `SIZE NOTE: ${warning}\n` : ''}OPTION CARDS SHOWN: ${order.options.length ? order.options.map((o) => `"${o.title}"`).join(', ') : 'none'}`;
}

/** The host talks with the customer and hands work to the designer. It never changes the order itself. */
export function hostPrompt(order: Order, clock: Clock): string {
  return `You are the host on a small bakery's online order desk. You talk with the customer. A colleague, the designer, works on the order: you give the designer tasks with ask_designer, and the designer reports back to you. You cannot change the order yourself.

${SHOP_RULES}

HOW TO WORK
- When the customer wants something on the order changed or made (details, the design, ideas to choose from), call ask_designer with one precise task carrying their exact words and values, then reply. Your reply goes out before the designer starts: say it's in hand ("On it, I've asked our designer to …"). NEVER say a change is done until the designer has reported it.
- Questions about the shop, what we make, or the current design: answer yourself, no task needed.
- Things we never make: say so kindly, put them in cant_do, and offer the nearest thing we make (you may ask the designer for that).
- The JOB BOARD below shows the designer's work. If a job is open and the customer asks how it's going, tell them what the designer is doing from its progress. If they ask for something else meanwhile, give the designer another task; jobs run one after the other.
- Lines "[Designer → host] ..." are the designer's reports. "[Panel] ..." are changes the customer made with the controls; accept them. "(Designer changed: ...)" are the designer's changes; "[Undone] ..." means the customer undid them.
- Keep replies short and friendly, at most one question. Call reply exactly once, last.

${orderText(order, clock)}

JOB BOARD
${boardText(order, clock)}

${catalogText(order.brief)}`;
}

/** The designer works on the order with tools and reports to the host. It never talks with the customer. */
export function designerPrompt(order: Order, clock: Clock): string {
  return `You are the cake designer at a small bakery. You work on the customer's order with your tools. You never talk with the customer: the host does that. The host gives you one task; you do it and end with report, which goes to the host.

${SHOP_RULES}

HOW TO WORK
- Your tools change the order directly, each through the rule checker. If a tool says "Refused", nothing changed: adapt (for example pick a value from get_allowed_values) or report why.
- Changing the guests: set_brief guests; if the result says the size no longer fits or is far too big, also set_design size to the smallest size that serves them.
- An open wish with no design yet ("a unicorn cake for my daughter") → propose_options with 2 to 4 different candidates. If the task names one exact cake, start_design is fine. A change to the current design → set_design.
- Use only ids from the catalog. Template parts marked Fixed can't change.
- Do only what the task asks. If something must be decided by the customer first, don't guess: put the question in report.
- End by calling report exactly once: a plain summary of what you changed and what was refused and why. No prices.

${orderText(order, clock)}

${catalogText(order.brief)}`;
}

/** Notes made in the panel (or old notes with no `by`) since the assistant last spoke. */
export function panelNotesSinceAssistant(order: Order): string[] {
  let lastAssistant = -1;
  order.chat.forEach((c, i) => {
    if (c.kind === 'assistant') lastAssistant = i;
  });
  return order.chat.slice(lastAssistant + 1).filter((c) => c.kind === 'ui' && c.by !== 'assistant').map((c) => c.change ?? c.text);
}

function baseContext(order: Order, clock: Clock, lastText: string): ProviderInput['context'] {
  return {
    brief: order.brief,
    design: order.design,
    today: todayOf(clock),
    lastText,
    notes: panelNotesSinceAssistant(order),
    step: 0,
    results: [],
    retry: false,
    start: { brief: order.brief, design: order.design },
    jobs: (order.jobs ?? []).map((j) => shownJob(j, clock)),
  };
}

type Line = { role: 'user' | 'assistant'; text: string };

/** One chat line in words, from the host's side. Empty for lines the model doesn't need (system notes). */
function lineFor(c: ChatMessage): Line[] {
  if (c.kind === 'customer') return [{ role: 'user', text: c.text }];
  if (c.kind === 'assistant') return [{ role: 'assistant', text: c.text }];
  if (c.kind === 'handoff' && c.from === 'host') return [{ role: 'assistant', text: `(I asked the designer, job ${c.job}: ${c.text})` }];
  if (c.kind === 'handoff') return [{ role: 'user', text: `[Designer → host, job ${c.job}] ${c.text}` }];
  if (c.kind === 'ui' && c.by === 'assistant') {
    const out: Line[] = [{ role: 'assistant', text: `(Designer changed: ${c.change ?? c.text})` }];
    if (c.undone) out.push({ role: 'user', text: `[Undone] ${c.change ?? c.text}` });
    return out;
  }
  if (c.kind === 'ui') return [{ role: 'user', text: `[Panel] ${c.change ?? c.text}` }];
  return [];
}

/**
 * The host's input: the chat as provider messages, consecutive messages of one role merged.
 * `reply`: answer the customer's last message. `ack`: acknowledge panel changes. `report`: relay `job`'s report.
 */
export function hostInput(order: Order, expect: 'reply' | 'ack' | 'report', clock: Clock, job?: Job): ProviderInput {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = messages.at(-1);
    if (last && last.role === role) last.content += `\n${content}`;
    else messages.push({ role, content });
  };
  for (const c of order.chat) for (const l of lineFor(c)) push(l.role, l.text);
  const lastCustomer = [...order.chat].reverse().find((c) => c.kind === 'customer');
  if (messages.length === 0 || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(The customer just filled in the order details and is waiting for your first reply.)' });
  if (expect === 'ack') push('user', '(Acknowledge the panel changes above in one or two plain sentences. Mention a size warning or a matching idea where useful. No tools, no prices.)');
  else if (expect === 'report' && job)
    push(
      'user',
      job.status === 'failed'
        ? `(The designer could not finish job ${job.id} ("${job.task}"), so nothing changed. Tell the customer kindly and offer to try again.)`
        : `(The designer finished job ${job.id}. Tell the customer what was done, in plain words. If the report has questions, ask the most important one. Offer the report's suggestions if they fit.${
            job.report?.suggestions.length ? ` Report suggestions: ${job.report.suggestions.join(' | ')}` : ''
          })`,
    );
  else if (messages.at(-1)!.role === 'assistant') push('user', '(Continue.)');
  return {
    agent: 'host',
    expect,
    system: hostPrompt(order, clock),
    messages,
    tools: [],
    context: { ...baseContext(order, clock, lastCustomer?.text ?? ''), ...(job ? { job } : {}) },
  };
}

/** The designer's input: recent chat for context, then the task. `extra` is a note for a second try. */
export function designerInput(order: Order, job: Job, clock: Clock, extra?: string): ProviderInput {
  const who = (c: ChatMessage) => (c.kind === 'customer' ? 'Customer: ' : c.kind === 'assistant' ? 'Host: ' : '');
  const recent = order.chat
    .filter((c) => c.kind === 'customer' || c.kind === 'assistant' || c.kind === 'ui')
    .slice(-10)
    .flatMap((c) => lineFor(c).map((l) => `${who(c)}${l.text}`));
  const content = `RECENT CHAT (for context only; the host talks with the customer)\n${recent.join('\n') || '(none)'}\n\nYOUR TASK (job ${job.id}): ${job.task}${extra ? `\n\n${extra}` : ''}`;
  return {
    agent: 'designer',
    expect: 'work',
    system: designerPrompt(order, clock),
    messages: [{ role: 'user', content }],
    tools: [],
    context: { ...baseContext(order, clock, job.task), job },
  };
}
