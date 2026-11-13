// The assistant's tools (devlog 05 §2). Each one works on the turn's copy of the order through the same stage
// functions the panel uses, so the checker refuses for the assistant exactly what it refuses for the customer.
// There is no tool for prices, confirming, approving or declining, on purpose.
import {
  COLOURS,
  allowedValues,
  applyField,
  check,
  defaultDesign,
  fittingSize,
  price,
  sizeWarning,
  template,
  type Candidate,
  type Design,
  type DesignField,
  type Order,
  type Reason,
} from '@cakeshop/shared';
import { HttpError } from '../errors';
import { stageBrief, stageChange, todayOf, type Clock } from '../orders/applyChange';
import { parseBrief } from '../orders/brief';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const DESIGN_FIELDS: DesignField[] = ['size', 'sponge', 'filling', 'finish', 'colour', 'decorations', 'topper', 'message', 'picture', 'digits', 'glutenFree', 'extras'];
const BRIEF_FIELDS = ['guests', 'date', 'occasion', 'dietary', 'fulfilment'] as const;
const ANY_VALUE = {
  anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }],
};
const OPTIONAL_FIELDS: Record<string, unknown> = {
  size: { type: 'string' },
  sponge: { type: 'string' },
  filling: { type: 'string' },
  finish: { type: 'string' },
  colour: { type: 'string', enum: COLOURS.map((c) => c.id) },
  decorations: { type: 'array', items: { type: 'string' } },
  topper: { type: 'string' },
  message: { type: 'string' },
  picture: { type: 'string' },
  digits: { type: 'string' },
};

export const REPLY_TOOL = 'reply';
export const REPORT_TOOL = 'report';
export const ASK_TOOL = 'ask_designer';

/** The designer's tools: they work on the order. The designer ends each job with `report`. */
export const WORK_TOOLS: ToolDef[] = [
  {
    name: 'set_brief',
    description:
      'Change one order detail. guests: a whole number. date: YYYY-MM-DD. occasion: an occasion id. dietary: a list of "gluten-free" and/or "vegan" ([] for none). fulfilment: "pickup" or "delivery". ' +
      'The checker re-checks the current design against the new details; if it refuses, nothing changes and you get the reasons. The result also says when the size no longer serves the guests.',
    input_schema: {
      type: 'object',
      properties: { field: { type: 'string', enum: [...BRIEF_FIELDS] }, value: ANY_VALUE },
      required: ['field', 'value'],
    },
  },
  {
    name: 'set_design',
    description:
      'Change one field of the current design. For decorations and extras, value is the whole new list. Use ids from the catalog. ' +
      'If the checker refuses, nothing changes and you get the reasons. Needs a current design (use start_design or propose_options first).',
    input_schema: {
      type: 'object',
      properties: { field: { type: 'string', enum: DESIGN_FIELDS }, value: ANY_VALUE },
      required: ['field', 'value'],
    },
  },
  {
    name: 'start_design',
    description: 'Start the design from a template, sized for the guests. Only when there is no design yet, or the customer asks to start over with a different cake.',
    input_schema: { type: 'object', properties: { template: { type: 'string' } }, required: ['template'] },
  },
  {
    name: 'propose_options',
    description:
      'Show the customer 2 to 4 option cards to choose from, when their wish is open. Each candidate is a template plus the fields you want to differ from its defaults; ' +
      'the size defaults to the smallest that serves the guests. The checker tests each one: only those that pass are shown, and the result tells you which failed and why. ' +
      'Do not describe prices: each card shows its own.',
    input_schema: {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, note: { type: 'string', description: "One sentence, a designer's note." }, template: { type: 'string' }, ...OPTIONAL_FIELDS },
            required: ['title', 'note', 'template'],
          },
        },
      },
      required: ['candidates'],
    },
  },
  {
    name: 'get_allowed_values',
    description: 'List the values of one design field the checker would accept right now, and the reason for each value it would refuse.',
    input_schema: { type: 'object', properties: { field: { type: 'string', enum: DESIGN_FIELDS } }, required: ['field'] },
  },
  {
    name: 'check_design',
    description: "The checker's verdict on the current design with the current order details.",
    input_schema: { type: 'object', properties: {} },
  },
];

const REPORT_DEF: ToolDef = {
  name: REPORT_TOOL,
  description:
    'End the job with your report to the host, who tells the customer. Call it exactly once, last. ' +
    'summary: what you did and what was refused and why, in plain words, no prices (the host reads it, not the customer). ' +
    'questions: what the host should ask the customer before you can go on ([] if none). ' +
    'suggestions: up to 3 short replies the customer could click to answer, like "Yes, deliver it" ([] if none).',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      questions: { type: 'array', items: { type: 'string' } },
      suggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary'],
  },
};

const REPLY_DEF: ToolDef = {
  name: REPLY_TOOL,
  description:
    'What the customer reads. Call it exactly once, last. text: short and friendly, no prices. ' +
    "cant_do: things the customer asked for that the shop can't do ([] if none). suggestions: up to 3 short ideas the customer can click, like \"Add a rainbow drip\" ([] if none).",
  input_schema: {
    type: 'object',
    properties: { text: { type: 'string' }, cant_do: { type: 'array', items: { type: 'string' } }, suggestions: { type: 'array', items: { type: 'string' } } },
    required: ['text'],
  },
};

const ASK_DEF: ToolDef = {
  name: ASK_TOOL,
  description:
    'Give the designer a task on the order. The designer changes the order (details, design, option cards) through the rule checker, then reports back to you. ' +
    'task: one precise instruction with the exact values the customer gave, e.g. "Set guests to 10 and re-fit the size", "Show 3 options for a unicorn cake, one with a rainbow drip". ' +
    "The work happens after your reply, so in your reply say it's in hand; never say it is done.",
  input_schema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
};

export const DESIGNER_TOOLS: ToolDef[] = [...WORK_TOOLS, REPORT_DEF];
export const HOST_TOOLS: ToolDef[] = [ASK_DEF, REPLY_DEF];
export const HOST_REPORT_TOOLS: ToolDef[] = [REPLY_DEF];

/** What a tool did. `text` goes back to the model; `change` becomes a note the customer sees. */
export interface ToolRun {
  ok: boolean;
  text: string;
  change?: string;
  options?: boolean;
}

const refused = (reasons: Reason[]): ToolRun => ({ ok: false, text: `Refused, nothing changed: ${reasons.map((r) => r.text).join(' ')}` });
const fail = (text: string): ToolRun => ({ ok: false, text });

function warningOf(w: Order): string {
  const warn = w.design ? sizeWarning(w.design, w.brief) : null;
  return warn ? ` Note: ${warn}` : '';
}

function candidateDesign(w: Order, raw: Record<string, unknown>): Design | string {
  const tpl = template(String(raw.template ?? ''));
  if (!tpl) return `Unknown template "${String(raw.template)}".`;
  let d: Design = { ...defaultDesign(tpl.id, w.brief), size: fittingSize(tpl.id, w.brief.guests) };
  for (const f of Object.keys(OPTIONAL_FIELDS) as DesignField[]) {
    const v = raw[f];
    if (v !== undefined && v !== null) d = applyField(d, f, v as string | string[]);
  }
  return d;
}

/** Runs one tool on the working copy `w`. Never throws for bad input: the model gets a plain explanation. */
/** `addCards`: cards shown earlier in this same job stay, and new ones are added (up to 4); otherwise new cards replace old ones. */
export function runTool(w: Order, name: string, input: Record<string, unknown>, clock: Clock, opts: { addCards?: boolean } = {}): ToolRun {
  const today = todayOf(clock);
  switch (name) {
    case 'set_brief': {
      const field = String(input.field);
      if (!(BRIEF_FIELDS as readonly string[]).includes(field)) return fail(`Unknown order detail "${field}".`);
      let next;
      try {
        next = parseBrief({ ...w.brief, [field]: input.value }, today);
      } catch (e) {
        if (e instanceof HttpError) return e.reasons?.length ? refused(e.reasons) : fail(`Refused, nothing changed: ${e.message}`);
        throw e;
      }
      const r = stageBrief(w, next, 'assistant', clock);
      if (!r.ok) return refused(r.reasons);
      return { ok: true, text: `Done: ${r.change}.${warningOf(w)}`, change: r.change };
    }
    case 'set_design': {
      if (!w.design) return fail('There is no design yet. Use start_design or propose_options first.');
      const field = String(input.field) as DesignField;
      if (!DESIGN_FIELDS.includes(field)) return fail(`Unknown design field "${field}".`);
      const value = input.value as string | boolean | string[];
      const r = stageChange(w, applyField(w.design, field, value), 'assistant', clock);
      if (!r.ok) return refused(r.reasons);
      return { ok: true, text: `Done: ${r.change}.${warningOf(w)}`, change: r.change };
    }
    case 'start_design': {
      const d = candidateDesign(w, { template: input.template });
      if (typeof d === 'string') return fail(d);
      const r = stageChange(w, d, 'assistant', clock, `started from ${template(d.template)!.name}`);
      if (!r.ok) return refused(r.reasons);
      return { ok: true, text: `Done: ${r.change}.${warningOf(w)}`, change: r.change };
    }
    case 'propose_options': {
      const kept = opts.addCards ? w.options : [];
      const room = 4 - kept.length;
      if (room <= 0) return fail('4 cards are already shown, the most there can be.');
      const list = Array.isArray(input.candidates) ? (input.candidates as Record<string, unknown>[]).slice(0, room) : [];
      if (!list.length) return fail('Give at least one candidate.');
      const passed: Candidate[] = [];
      const lines: string[] = [];
      let id = w.options.reduce((m, o) => Math.max(m, o.id), 0);
      list.forEach((raw, i) => {
        const title = String(raw.title ?? `Option ${i + 1}`);
        const d = candidateDesign(w, raw);
        if (typeof d === 'string') return void lines.push(`${i + 1}. "${title}": not shown. ${d}`);
        const r = checkDesign(d, w, today);
        if (r.length) return void lines.push(`${i + 1}. "${title}": not shown. ${r.map((x) => x.text).join(' ')}`);
        passed.push({ id: ++id, title, note: String(raw.note ?? ''), design: { ...d, version: 0 }, quote: price(d, w.brief) });
        lines.push(`${i + 1}. "${title}": shown.`);
      });
      const before = kept.length ? ` ${kept.length} card(s) were already shown.` : '';
      if (!passed.length) return { ok: false, text: `None of these passed, so no new cards are shown.${before}\n${lines.join('\n')}` };
      w.options = [...kept, ...passed];
      const total = w.options.length;
      return {
        ok: true,
        text: `${passed.length} new card(s) shown, ${total} in all.${total < 2 ? ' You may call propose_options again with fixed candidates; they are added to the cards already shown.' : ''}\n${lines.join('\n')}`,
        options: true,
      };
    }
    case 'get_allowed_values': {
      if (!w.design) return fail('There is no design yet.');
      const field = String(input.field) as DesignField;
      if (!DESIGN_FIELDS.includes(field)) return fail(`Unknown design field "${field}".`);
      const vals = allowedValues(w.design, w.brief, field, today);
      if (!vals.length) return { ok: true, text: `This cake has no choices for ${field}.` };
      return { ok: true, text: vals.map((v) => `${String(v.value)} (${v.label}): ${v.ok ? 'ok' : `no, ${v.reason}`}`).join('\n') };
    }
    case 'check_design': {
      if (!w.design) return { ok: true, text: 'There is no design yet.' };
      const r = checkDesign(w.design, w, today);
      return { ok: true, text: r.length ? `Does not pass: ${r.map((x) => x.text).join(' ')}` : `Passes every rule.${warningOf(w)}` };
    }
    default:
      return fail(`Unknown tool "${name}".`);
  }
}

function checkDesign(d: Design, w: Order, today: string): Reason[] {
  const r = check(d, w.brief, today);
  return r.ok ? [] : r.reasons;
}
