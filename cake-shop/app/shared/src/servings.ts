import { line, template } from './catalog';
import type { Brief, Design } from './types';

export function servesOf(design: Design): number {
  const tpl = template(design.template);
  if (!tpl) return 0;
  return line(tpl.line).sizes.find((s) => s.id === design.size)?.serves ?? 0;
}

/** Warns when the cake serves fewer people than the order's guest count. Returns null when it's enough. */
export function sizeWarning(design: Design, brief: Brief): string | null {
  const tpl = template(design.template);
  if (!tpl) return null;
  const ln = line(tpl.line);
  const size = ln.sizes.find((s) => s.id === design.size);
  if (!size || size.serves >= brief.guests) return null;
  const what = ln.id === 'round' ? `A ${size.label} round` : `This ${ln.name.toLowerCase()} (${size.label})`;
  return `${what} serves ${size.serves}. Your order says ${brief.guests} guests.`;
}
