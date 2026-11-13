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
  type Order,
  type Snapshot,
} from '@cakeshop/shared';
import { todayOf, type Clock } from '../orders/applyChange';
import type { ToolDef } from './tools';

export type Expect = 'reply' | 'ack';

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
    lastText: string;
    notes: string[];
    /** Which step of the turn this is (0 = the first call), and the tool results so far in this turn. */
    step: number;
    results: ToolResult[];
    /** True on the second try after the customer changed the order mid-turn. */
    retry: boolean;
    /** The brief and design when the turn began (brief and design above follow the tool calls). */
    start: Snapshot;
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

export function systemPrompt(order: Order, clock: Clock): string {
  const b = order.brief;
  const warning = order.design ? sizeWarning(order.design, b) : null;
  return `You are the design assistant on a small bakery's online order desk. The order is a shared workspace: the customer changes it with the panel controls, you change it with your tools, and both of you see every change. Your tools change the order directly; the customer sees each change and can undo it.

HOW THE SHOP WORKS
- A separate rule checker validates every change, from you or the customer. If a tool says "Refused", nothing changed: adapt (for example pick a value from get_allowed_values) or explain kindly.
- A separate pricing function sets every price. NEVER write a price, an amount of money, a discount or a total. If asked about cost, say the price shows next to the design and updates by itself.
- You cannot confirm, pay for, approve or decline an order. The customer confirms with "Review & confirm"; the baker approves.
- We never make: 3D sculpted shapes, likenesses of real people (sculpted or printed), more than 3 tiers, cakes with alcohol, delivery outside the local area, orders with less than 2 days' notice.

HOW TO WORK
- When the customer says something that changes the order, change it with a tool; don't ask them to do it. Example: "there will be 10 of us" → set_brief guests 10; if the result says the size no longer fits or is far too big, also set_design size to the smallest size that serves them.
- An open wish with no design yet ("a unicorn cake for my daughter") → propose_options with 2 to 4 different candidates. If the customer names one exact cake, start_design is fine.
- A change to the current design → set_design. Questions → answer, no tools needed.
- Use only ids from the catalog. Template parts marked Fixed can't change.
- Lines "[Panel] ..." are changes the customer made with the controls; accept them. Lines "(I changed: ...)" are your earlier tool changes; "[Undone] ..." means the customer undid that change, so don't redo it unless asked.
- End every turn by calling reply exactly once. Keep it short and friendly, ask at most one question, and say in words what you changed. Put things we can't do in cant_do and offer the nearest thing we can make.

ORDER DETAILS
occasion: ${b.occasion}; guests: ${b.guests}; date: ${b.date} (today is ${todayOf(clock)}); dietary: ${b.dietary.join(', ') || 'none'}; ${b.fulfilment}${b.slot ? `, slot ${b.slot}` : ''}
CURRENT DESIGN: ${order.design ? JSON.stringify({ ...order.design, version: undefined }) : 'none yet'}
${warning ? `SIZE NOTE: ${warning}\n` : ''}
${catalogText(b)}`;
}

/** Notes made in the panel (or old notes with no `by`) since the assistant last spoke. */
export function panelNotesSinceAssistant(order: Order): string[] {
  let lastAssistant = -1;
  order.chat.forEach((c, i) => {
    if (c.kind === 'assistant') lastAssistant = i;
  });
  return order.chat.slice(lastAssistant + 1).filter((c) => c.kind === 'ui' && c.by !== 'assistant').map((c) => c.change ?? c.text);
}

/**
 * The chat as provider messages. Panel changes become "[Panel]" lines, the assistant's own changes "(I changed: …)".
 * Consecutive messages of one role are merged.
 */
export function buildInput(order: Order, expect: Expect, clock: Clock, extra?: string): ProviderInput {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = messages.at(-1);
    if (last && last.role === role) last.content += `\n${content}`;
    else messages.push({ role, content });
  };
  for (const c of order.chat) {
    if (c.kind === 'customer') push('user', c.text);
    else if (c.kind === 'assistant') push('assistant', c.text);
    else if (c.kind === 'ui' && c.by === 'assistant') {
      push('assistant', `(I changed: ${c.change ?? c.text})`);
      if (c.undone) push('user', `[Undone] ${c.change ?? c.text}`);
    } else if (c.kind === 'ui') push('user', `[Panel] ${c.change ?? c.text}`);
  }
  const lastCustomer = [...order.chat].reverse().find((c) => c.kind === 'customer');
  if (messages.length === 0 || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(The customer just filled in the order details and is waiting for your first reply.)' });
  if (expect === 'ack') push('user', '(Acknowledge the panel changes above in one or two plain sentences. Mention a size warning or a matching idea where useful. No tools, no prices.)');
  else if (messages.at(-1)!.role === 'assistant') push('user', '(Continue.)');
  if (extra) push('user', extra);
  return {
    expect,
    system: systemPrompt(order, clock),
    messages,
    tools: [],
    context: {
      brief: order.brief,
      design: order.design,
      today: todayOf(clock),
      lastText: lastCustomer?.text ?? '',
      notes: panelNotesSinceAssistant(order),
      step: 0,
      results: [],
      retry: false,
      start: { brief: order.brief, design: order.design },
    },
  };
}
