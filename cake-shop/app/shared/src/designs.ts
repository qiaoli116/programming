// Helpers that build and change designs. They do no checking: `check` does that.
import { LINES, line, template, templatesFor } from './catalog';
import type { Brief, Design, DesignField } from './types';
import type { Template } from './catalog';

export function defaultDesign(templateId: string, brief: Brief): Design {
  const tpl = template(templateId);
  if (!tpl) throw new Error(`Unknown template ${templateId}`);
  const merged = { ...tpl.defaults, ...tpl.fixed };
  const ln = line(tpl.line);
  return {
    template: tpl.id,
    size: merged.size ?? ln.sizes[0].id,
    sponge: merged.sponge ?? 'vanilla',
    filling: merged.filling,
    finish: merged.finish,
    colour: merged.colour ?? 'white',
    decorations: [...(merged.decorations ?? [])],
    topper: merged.topper,
    message: merged.message || undefined,
    picture: merged.picture,
    digits: merged.digits,
    glutenFree: brief.dietary.includes('gluten-free'),
    vegan: brief.dietary.includes('vegan'),
    extras: [],
  };
}

const ARRAYS: DesignField[] = ['decorations', 'extras'];

/** Sets one field. For decorations and extras, `value` is the whole new list. */
export function applyField(design: Design, field: DesignField, value: string | boolean | string[]): Design {
  const next: Design = { ...design, decorations: [...design.decorations], extras: [...design.extras] };
  if (ARRAYS.includes(field)) {
    (next as unknown as Record<string, unknown>)[field] = Array.isArray(value) ? value : [String(value)];
  } else if (field === 'glutenFree' || field === 'vegan') {
    next[field] = Boolean(value);
  } else if (value === '' || value === undefined || value === null) {
    (next as unknown as Record<string, unknown>)[field] = undefined;
  } else {
    (next as unknown as Record<string, unknown>)[field] = value;
  }
  return next;
}

/** Tries one option value: adds or removes it for list fields, sets it for the rest. */
export function toggleValue(design: Design, field: DesignField, value: string): Design {
  if (ARRAYS.includes(field)) {
    const list = (design[field as 'decorations' | 'extras'] ?? []) as string[];
    return applyField(design, field, list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }
  return applyField(design, field, value);
}

/** Templates that fit the brief: right occasion, a size that serves the guests, a line that allows the dietary needs. */
export function suggestTemplates(brief: Brief): Template[] {
  return templatesFor(brief.occasion).filter((t) => {
    const ln = LINES.find((l) => l.id === t.line)!;
    if (brief.dietary.includes('gluten-free') && !ln.glutenFree) return false;
    if (brief.dietary.includes('vegan') && !ln.vegan) return false;
    return ln.sizes.some((s) => s.serves >= brief.guests);
  });
}

/** The smallest size of the template's line that serves the guests (or the largest if none does). */
export function fittingSize(templateId: string, guests: number): string {
  const tpl = template(templateId)!;
  const sizes = line(tpl.line).sizes;
  return (sizes.find((s) => s.serves >= guests) ?? sizes[sizes.length - 1]).id;
}

/** A short description of one field change for the chat ("colour white → purple"). */
export function describeChange(before: Design, after: Design): string {
  const parts: string[] = [];
  const keys: DesignField[] = ['size', 'sponge', 'filling', 'finish', 'colour', 'topper', 'message', 'picture', 'digits'];
  for (const k of keys) {
    const a = before[k as keyof Design];
    const b = after[k as keyof Design];
    if (String(a ?? '') !== String(b ?? '')) parts.push(`${k} ${a ? a : 'none'} → ${b ? b : 'none'}`);
  }
  for (const k of ['decorations', 'extras'] as const) {
    if ([...before[k]].sort().join() !== [...after[k]].sort().join()) {
      parts.push(`${k} ${before[k].join(', ') || 'none'} → ${after[k].join(', ') || 'none'}`);
    }
  }
  if (before.glutenFree !== after.glutenFree) parts.push(`gluten-free ${before.glutenFree ? 'yes' : 'no'} → ${after.glutenFree ? 'yes' : 'no'}`);
  if (before.vegan !== after.vegan) parts.push(`vegan ${before.vegan ? 'yes' : 'no'} → ${after.vegan ? 'yes' : 'no'}`);
  return parts.join('; ');
}
