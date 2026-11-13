// Builds what the provider receives: the system prompt (catalog without prices, rules), the chat, and a structured
// context that the fake provider reads. The prompt gives the AI no prices, on purpose.
import {
  COLOURS,
  DECORATIONS,
  EXTRAS,
  FILLINGS,
  FINISHES,
  LINES,
  OCCASIONS,
  PICTURES,
  SLOTS,
  SPONGES,
  TOPPERS,
  VEGAN_SPONGES,
  occasion,
  sizeWarning,
  templatesFor,
  type Brief,
  type Design,
  type Order,
  type Reason,
} from '@cakeshop/shared';
import { todayOf, type Clock } from '../orders/applyChange';

export type Expect = 'reply' | 'ack';

export interface ProviderInput {
  expect: Expect;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Structured copy of the same facts, for the fake provider (the real one reads the prompt). */
  context: {
    brief: Brief;
    design: Design | null;
    today: string;
    lastText: string;
    notes: string[];
    reasons: Reason[];
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
    `sponge: ${list(SPONGES)} (vegan: ${VEGAN_SPONGES.join(' or ')} only; red velvet is never gluten-free or vegan)\n` +
    `filling: ${list(FILLINGS)}\nfinish: ${list(FINISHES)} (fondant: round and tiered only)\n` +
    `colour: ${list(COLOURS)}\ndecorations: ${list(DECORATIONS)} (drips: round, tiered, mini only)\n` +
    `topper: ${list(TOPPERS)} (not on number cakes or sheets)\npicture: ${list(PICTURES)} (round and sheet only; never photos of people)\n` +
    `extras: ${list(EXTRAS)}\ntime slots: ${list(SLOTS)}\n`;
}

export function systemPrompt(order: Order, clock: Clock): string {
  const b = order.brief;
  const warning = order.design ? sizeWarning(order.design, b) : null;
  return `You are the design assistant on a small bakery's online order desk. You chat with a customer and propose cake designs.

HOW THE SHOP WORKS
- You propose designs only from the catalog below. A separate rule checker validates every design you send, and a separate pricing function sets every price.
- NEVER write a price, an amount of money, a discount or a total anywhere in your reply. If asked about cost, say the exact price shows next to the design and is added automatically.
- We never make: 3D sculpted shapes, likenesses of real people (sculpted or printed), more than 3 tiers, cakes with alcohol, delivery outside the local area, orders with less than 2 days' notice. If asked for one of these, say so kindly in "text", list it in "cantDo", and offer the nearest designs we can make.
- Keep replies short and friendly. Ask at most one question at a time. Use the details the customer already gave.
- Panel notes in the chat (lines starting with "[Panel]") are changes the customer made with the controls. Accept them as the current design.

REPLY FORMAT (JSON, no other text)
- kind "options": the wish is open. Give 2 to 4 different candidates, each with a short title and a one-sentence designer's note. The customer picks one with a Choose button.
- kind "refine": the customer asked to change the current design. Give exactly 1 candidate: the full current design with the change applied.
- kind "answer": a question, or something we can't do. No candidates.
- kind "ack": you are acknowledging panel changes. One or two sentences, no candidates. Mention a size warning or a matching suggestion where useful.
- "text" is what the customer reads. "cantDo" lists what we can't do. "suggestions" are short ideas the customer can click (for example "Add a rainbow drip"). Use [] when empty.
- A design is { template, size, sponge, filling, finish, colour, decorations[], topper, message, picture, digits, glutenFree, vegan, extras[] } using the ids below. Use null for fields that don't apply. glutenFree and vegan must match the order's dietary needs.
- Template parts marked Fixed can't be removed or changed.

ORDER DETAILS
occasion: ${b.occasion}; guests: ${b.guests}; date: ${b.date} (today is ${todayOf(clock)}); dietary: ${b.dietary.join(', ') || 'none'}; ${b.fulfilment}${b.slot ? `, slot ${b.slot}` : ''}
CURRENT DESIGN: ${order.design ? JSON.stringify({ ...order.design, version: undefined }) : 'none yet'}
${warning ? `SIZE NOTE: ${warning}\n` : ''}
${catalogText(b)}`;
}

/** The chat as provider messages. Panel changes become "[Panel]" lines. Consecutive messages of one role are merged. */
export function buildInput(order: Order, expect: Expect, clock: Clock, reasons: Reason[] = []): ProviderInput {
  const messages: ProviderInput['messages'] = [];
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = messages.at(-1);
    if (last && last.role === role) last.content += `\n${content}`;
    else messages.push({ role, content });
  };
  let lastAssistant = -1;
  order.chat.forEach((c, i) => {
    if (c.kind === 'assistant') lastAssistant = i;
  });
  for (const c of order.chat) {
    if (c.kind === 'customer') push('user', c.text);
    else if (c.kind === 'assistant') push('assistant', c.text);
    else if (c.kind === 'ui') push('user', `[Panel] ${c.change ?? c.text}`);
  }
  const lastCustomer = [...order.chat].reverse().find((c) => c.kind === 'customer');
  if (messages.length === 0 || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(The customer just filled in the order details and is waiting for your first reply.)' });
  if (expect === 'ack') push('user', '(Reply with kind "ack": acknowledge the panel changes above.)');
  else if (messages.at(-1)!.role === 'assistant') push('user', '(Continue.)');
  if (reasons.length) {
    push('user', `(The rule checker rejected your last designs: ${reasons.map((r) => r.text).join(' ')} Reply again with designs that pass.)`);
  }
  const notes = order.chat.slice(lastAssistant + 1).filter((c) => c.kind === 'ui').map((c) => c.change ?? c.text);
  return {
    expect,
    system: systemPrompt(order, clock),
    messages,
    context: { brief: order.brief, design: order.design, today: todayOf(clock), lastText: lastCustomer?.text ?? '', notes, reasons },
  };
}
