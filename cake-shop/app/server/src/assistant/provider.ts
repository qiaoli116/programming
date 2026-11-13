// The seam between the app and "the AI". The real provider (anthropic.ts) calls the API; the fake is deterministic
// and is what every automated test and demo uses (ASSISTANT_PROVIDER=fake).
import {
  COLOURS,
  applyField,
  defaultDesign,
  fittingSize,
  suggestTemplates,
  template,
  type Design,
} from '@cakeshop/shared';
import type { ProviderInput } from './prompt';

export interface AssistantProvider {
  readonly name: string;
  /** Returns the raw reply object (not yet validated). Throws when the provider can't answer. */
  turn(input: ProviderInput): Promise<unknown>;
}

// Tags a test can put in the customer's message to make the fake misbehave.
//   [REJECT]  one candidate the checker refuses, in every reply
//   [NOPASS]  every candidate is refused
//   [PRICE]   the reply text contains prices
//   [FAIL]    the provider throws
const colourIds = COLOURS.map((c) => c.id as string);

function badDesign(d: Design): Design {
  return { ...d, glutenFree: true, sponge: 'red-velvet' }; // red velvet is never gluten-free
}

const cand = (design: Design, title: string, note: string) => ({ design, title, note });

function optionsFor(input: ProviderInput) {
  const { brief } = input.context;
  const list: ReturnType<typeof cand>[] = [];
  const fits = suggestTemplates(brief);
  const tpls = fits.length ? fits : [template('unicorn-round')!];
  const base = (id: string): Design => {
    const d = defaultDesign(id, brief);
    return { ...d, size: fittingSize(id, brief.guests) };
  };
  const first = tpls[0];
  const a = base(first.id);
  list.push(cand(a, first.name, `${first.blurb}`));
  if (first.id === 'unicorn-round') {
    // The worked example from the design: A plain, B purple with a rainbow drip, C the dinosaur round.
    list.push(cand({ ...a, colour: 'purple', decorations: ['rainbow drip'] }, 'Purple with a rainbow drip', 'A bolder look: purple icing with a rainbow drip.'));
    const dino = template('dinosaur-round');
    if (dino) list.push(cand(base(dino.id), dino.name, dino.blurb));
  } else {
    for (const t of tpls.slice(1, 3)) list.push(cand(base(t.id), t.name, t.blurb));
    if (list.length < 2) list.push(cand({ ...a, colour: 'pink' as Design['colour'] }, 'In pink', 'The same cake in pink.'));
  }
  return list;
}

export class FakeProvider implements AssistantProvider {
  readonly name = 'fake';

  async turn(input: ProviderInput) {
    const { context: ctx } = input;
    const said = ctx.lastText;
    if (said.includes('[FAIL]')) throw new Error('fake provider failure');

    if (input.expect === 'ack') {
      return { kind: 'ack', text: `Got it: ${ctx.notes.join('; ') || 'no changes'}.`, candidates: [], cantDo: [], suggestions: [] };
    }

    let text = 'Here are some ideas.';
    if (said.includes('[PRICE]')) text = 'That one is $45 and the total is $120. It looks lovely.';

    // "make it purple" / "change the colour to pink": one candidate, the current design with the new colour.
    const m = /(?:make it|change (?:the )?colou?r to)\s+(\w+)/i.exec(said);
    if (ctx.design && m) {
      const colour = m[1].toLowerCase();
      if (colourIds.includes(colour)) {
        const next = applyField(ctx.design, 'colour', colour);
        return { kind: 'refine', text: `Done, it's ${colour} now. ${text === 'Here are some ideas.' ? '' : text}`.trim(), candidates: [cand(said.includes('[NOPASS]') ? badDesign(next) : next, `In ${colour}`, '')], cantDo: [], suggestions: [] };
      }
    }
    if (ctx.design && /^(what|how|can|do|does|is|are)\b/i.test(said.trim())) {
      return { kind: 'answer', text: text === 'Here are some ideas.' ? 'Yes, I can help with that. What would you like to change?' : text, candidates: [], cantDo: [], suggestions: [] };
    }

    let candidates = optionsFor(input);
    if (said.includes('[NOPASS]')) candidates = candidates.map((c) => cand(badDesign(c.design), c.title, c.note));
    else if (said.includes('[REJECT]')) candidates = [candidates[0], cand(badDesign(candidates[0].design), 'Red velvet gluten-free', 'Rich and red.')];
    return { kind: 'options', text, candidates, cantDo: [], suggestions: [] };
  }
}
