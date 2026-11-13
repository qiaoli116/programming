// What the AI sends back: the JSON schema, a strict reader, and the price guardrail.
import type { AssistantReply, Brief, Design, ReplyKind } from '@cakeshop/shared';

const KINDS: ReplyKind[] = ['options', 'refine', 'answer', 'ack'];
const nullable = (type: string) => ({ type: [type, 'null'] });

// Optional design fields are nullable, so every property can be required (a rule of structured output).
const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    template: { type: 'string' },
    size: { type: 'string' },
    sponge: { type: 'string' },
    filling: nullable('string'),
    finish: nullable('string'),
    colour: { type: 'string' },
    decorations: { type: 'array', items: { type: 'string' } },
    topper: nullable('string'),
    message: nullable('string'),
    picture: nullable('string'),
    digits: nullable('string'),
    glutenFree: { type: 'boolean' },
    vegan: { type: 'boolean' },
    extras: { type: 'array', items: { type: 'string' } },
  },
  required: ['template', 'size', 'sponge', 'filling', 'finish', 'colour', 'decorations', 'topper', 'message', 'picture', 'digits', 'glutenFree', 'vegan', 'extras'],
  additionalProperties: false,
} as const;

export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: KINDS },
    text: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { design: DESIGN_SCHEMA, title: { type: 'string' }, note: { type: 'string' } },
        required: ['design', 'title', 'note'],
        additionalProperties: false,
      },
    },
    cantDo: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['kind', 'text', 'candidates', 'cantDo', 'suggestions'],
  additionalProperties: false,
} as const;

export class ReplyError extends Error {}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function readDesign(raw: unknown, brief: Brief): Design | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const template = str(d.template);
  const size = str(d.size);
  const sponge = str(d.sponge);
  const colour = str(d.colour);
  if (!template || !size || !sponge || !colour) return null;
  return {
    template,
    size,
    sponge,
    filling: str(d.filling),
    finish: str(d.finish),
    colour: colour as Design['colour'],
    decorations: strList(d.decorations),
    topper: str(d.topper),
    message: str(d.message),
    picture: str(d.picture),
    digits: str(d.digits),
    glutenFree: typeof d.glutenFree === 'boolean' ? d.glutenFree : brief.dietary.includes('gluten-free'),
    vegan: typeof d.vegan === 'boolean' ? d.vegan : brief.dietary.includes('vegan'),
    extras: strList(d.extras),
  };
}

/** Reads the provider's raw reply. Throws ReplyError when it doesn't match the schema. */
export function parseReply(raw: unknown, brief: Brief): AssistantReply {
  if (!raw || typeof raw !== 'object') throw new ReplyError('The reply was not an object.');
  const r = raw as Record<string, unknown>;
  if (!KINDS.includes(r.kind as ReplyKind)) throw new ReplyError('The reply has an unknown kind.');
  if (typeof r.text !== 'string') throw new ReplyError('The reply has no text.');
  const candidates: AssistantReply['candidates'] = [];
  for (const c of Array.isArray(r.candidates) ? r.candidates : []) {
    const design = readDesign((c as Record<string, unknown>)?.design, brief);
    if (!design) throw new ReplyError('A candidate design is incomplete.');
    candidates.push({ design, title: str((c as Record<string, unknown>).title) ?? 'Design', note: str((c as Record<string, unknown>).note) ?? '' });
  }
  const kind = r.kind as ReplyKind;
  if (kind === 'options' && candidates.length === 0) throw new ReplyError('An options reply needs candidates.');
  if (kind === 'refine' && candidates.length === 0) throw new ReplyError('A refine reply needs one candidate.');
  return { kind, text: r.text, candidates, cantDo: strList(r.cantDo), suggestions: strList(r.suggestions) };
}

// An amount of money: $45, 45 dollars, AUD 45, "45 bucks".
const MONEY = /[$€£]\s?\d|\b\d[\d,.]*\s?(dollars?|bucks|usd|aud|cad|eur|gbp)\b|\b(usd|aud|cad)\s?\d/i;

/** Removes every sentence that mentions an amount of money. Prices come only from the Pricing function. */
export function stripPrices(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const parts = text.split(/(?<=[.!?])\s+|\n+/);
  const kept = parts.filter((p) => {
    if (MONEY.test(p)) {
      removed.push(p.trim());
      return false;
    }
    return true;
  });
  return { text: kept.join(' ').trim(), removed };
}
