// The Checker: the four levels of devlog 03, in order (shop-wide, product line, template, option compatibility).
// Pure and synchronous. It returns every reason, not just the first.
import {
  DECORATIONS,
  FILLINGS,
  FINISHES,
  PICTURES,
  SHOP,
  SPONGES,
  TOPPERS,
  EXTRAS,
  VEGAN_SPONGES,
  COLOURS,
  labelOf,
  line,
  optionValues,
  template,
} from './catalog';
import type { Brief, CheckResult, Design, DesignField, Reason, ReasonLevel } from './types';
import { toggleValue } from './designs';

const NO_PHOTOS = 'We can only print pictures from our library or your own logo. We never print photos of people.';

export function daysBetween(from: string, to: string): number {
  const f = from.split('-').map(Number);
  const t = to.split('-').map(Number);
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / 86400000);
}

function norm(v: unknown): string {
  if (Array.isArray(v)) return [...v].sort().join(',');
  return v === undefined || v === null ? '' : String(v);
}

export function checkReasons(design: Design, brief: Brief, today: string): Reason[] {
  const reasons: Reason[] = [];
  const add = (level: ReasonLevel, code: string, field: string, text: string) => reasons.push({ code, field, level, text });

  const tpl = template(design.template);
  if (!tpl) {
    add('template', 'unknown_template', 'template', `We don't have a template called "${design.template}".`);
    return reasons;
  }
  const ln = line(tpl.line);
  const size = ln.sizes.find((s) => s.id === design.size);

  // 1. Shop-wide
  const days = daysBetween(today, brief.date);
  const notice = Math.max(SHOP.minNoticeDays, ln.noticeDays, size?.noticeDays ?? 0);
  if (days < notice) {
    const need = Math.max(ln.noticeDays, size?.noticeDays ?? 0, SHOP.minNoticeDays);
    const what = size?.noticeDays && size.noticeDays > ln.noticeDays ? `${size.label} ${ln.name.toLowerCase()}s` : `${ln.name.toLowerCase()}s`;
    add(
      need > SHOP.minNoticeDays ? 'line' : 'shop',
      'notice',
      'date',
      `${what[0].toUpperCase()}${what.slice(1)} need ${need} days' notice. The date you chose is ${Math.max(days, 0)} day${days === 1 ? '' : 's'} away.`,
    );
  }

  // 2. Product line
  if (!size) add('line', 'unknown_size', 'size', `${ln.name} doesn't come in "${design.size}".`);
  if (size?.tiers && size.tiers > SHOP.maxTiers) add('shop', 'too_many_tiers', 'size', `We make 3 tiers at most.`);
  if (size?.tiers === 3 && brief.fulfilment !== 'delivery') {
    add('line', 'tiers_delivery', 'size', '3-tier cakes are delivered and set up at the venue. Choose delivery to order one.');
  }
  const has = (f: DesignField) => ln.groups.includes(f);
  if (!has('filling') && design.filling) add('line', 'no_filling', 'filling', `${ln.name} has no filling.`);
  if (!has('finish') && design.finish) add('line', 'no_finish', 'finish', `${ln.name} has no choice of finish.`);
  if (ln.finishRequired && !design.finish) add('line', 'finish_required', 'finish', `${ln.name} needs a finish.`);
  if (!has('topper') && design.topper) add('line', 'no_topper', 'topper', `${ln.name} can't take a topper.`);
  if (!has('picture') && design.picture) add('option', 'picture_line', 'picture', 'A printed picture is only for sheet and round cakes.');
  if (!has('digits') && design.digits && ln.id !== 'round') add('line', 'no_digits', 'digits', `Digits are only for number cakes.`);
  if (ln.messageMax === 0 && design.message) add('line', 'no_message', 'message', `${ln.name} can't have a piped message. A message card is available as an extra.`);
  if (ln.messageMax > 0 && (design.message ?? '').length > ln.messageMax) {
    add('line', 'message_too_long', 'message', `A message on a ${ln.name.toLowerCase()} can be ${ln.messageMax} characters at most. Yours has ${(design.message ?? '').length}.`);
  }
  if (design.decorations.length > ln.maxDecorations) {
    add('option', 'too_many_decorations', 'decorations', `${ln.name} can have ${ln.maxDecorations} decoration${ln.maxDecorations === 1 ? '' : 's'} at most.`);
  }
  if (!ln.glutenFree && design.glutenFree) add('line', 'gf_line', 'glutenFree', `${ln.name} can't be gluten-free.`);
  if (!ln.vegan && design.vegan) add('line', 'vegan_line', 'vegan', `${ln.name} can't be vegan.`);
  if (design.digits && ln.id === 'number') {
    const chars = size?.id === 'n2' ? 2 : 1;
    if (!/^[0-9A-Za-z]+$/.test(design.digits) || design.digits.length > chars) {
      add('line', 'digits_length', 'digits', `A ${size?.label ?? 'number'} cake takes ${chars} character${chars === 1 ? '' : 's'} (a digit or a letter).`);
    }
  }

  // 3. Template
  if (tpl.line !== ln.id) add('template', 'template_line', 'template', 'The template does not match the product line.');
  const lockedFields: DesignField[] = ['size', 'sponge', 'filling', 'finish', 'colour', 'decorations', 'topper', 'message', 'picture', 'digits'];
  for (const f of lockedFields) {
    if (tpl.changeable.includes(f)) continue;
    const expected = tpl.fixed[f as keyof typeof tpl.fixed] ?? tpl.defaults[f as keyof typeof tpl.defaults];
    const actual = design[f as keyof Design];
    if (norm(expected) !== norm(actual)) {
      add('template', `locked_${f}`, f, `The ${tpl.name} keeps its ${f === 'decorations' ? 'decorations' : f}${expected ? `: ${expected instanceof Array ? expected.join(', ') : labelOf(f, String(expected))}` : ''}. It can't be changed.`);
    }
  }
  for (const [f, v] of Object.entries(tpl.fixed)) {
    if (!tpl.changeable.includes(f as DesignField)) continue;
    const actual = design[f as keyof Design];
    const ok = Array.isArray(v) ? v.every((x) => (actual as string[]).includes(x)) : norm(v) === norm(actual);
    if (!ok) add('template', `fixed_${f}`, f, `The ${tpl.name} always has its ${f}.`);
  }
  if (tpl.palette && !tpl.palette.includes(design.colour)) {
    add('template', 'palette', 'colour', `The ${tpl.name} comes in ${tpl.palette.map((c) => labelOf('colour', c).toLowerCase()).join(', ')} only.`);
  }
  for (const f of tpl.required ?? []) {
    if (!norm(design[f as keyof Design])) add('template', `required_${f}`, f, `The ${tpl.name} needs a ${f}.`);
  }
  if (tpl.requireOneOf && !design.decorations.some((d) => tpl.requireOneOf!.values.includes(d))) {
    add('template', 'needs_drip', 'decorations', `The ${tpl.name} needs a drip.`);
  }
  if (tpl.season) {
    const md = brief.date.slice(5);
    const { from, to } = tpl.season;
    const inSeason = from <= to ? md >= from && md <= to : md >= from || md <= to;
    if (!inSeason) add('template', 'season', 'template', `The ${tpl.name} is only offered in its season.`);
  }

  // 4. Option compatibility
  const sponge = SPONGES.find((s) => s.id === design.sponge);
  if (!sponge) add('option', 'unknown_sponge', 'sponge', `We don't have a "${design.sponge}" sponge.`);
  if (design.sponge === 'red-velvet' && design.glutenFree) add('option', 'gf_red_velvet', 'sponge', "Red velvet isn't available gluten-free.");
  if (design.sponge === 'red-velvet' && design.vegan) add('option', 'vegan_red_velvet', 'sponge', "Red velvet isn't available vegan.");
  if (design.vegan && !VEGAN_SPONGES.includes(design.sponge) && design.sponge !== 'red-velvet') {
    add('option', 'vegan_sponge', 'sponge', 'Vegan cakes come in vanilla or chocolate sponge only.');
  }
  if (design.filling && !FILLINGS.some((x) => x.id === design.filling)) add('option', 'unknown_filling', 'filling', `We don't have a "${design.filling}" filling.`);
  if (design.finish) {
    const fin = FINISHES.find((x) => x.id === design.finish);
    if (!fin) add('option', 'unknown_finish', 'finish', `We don't have a "${design.finish}" finish.`);
    else if (fin.lines && !fin.lines.includes(ln.id)) add('option', 'fondant_line', 'finish', 'Fondant is only for round and tiered cakes.');
  }
  if (!COLOURS.some((c) => c.id === design.colour)) add('option', 'unknown_colour', 'colour', `We don't have the colour "${design.colour}".`);
  for (const d of design.decorations) {
    const dec = DECORATIONS.find((x) => x.id === d);
    if (!dec) add('option', 'unknown_decoration', 'decorations', `We don't have a decoration called "${d}".`);
    else if (dec.lines && !dec.lines.includes(ln.id)) add('option', 'drip_line', 'decorations', `${dec.label} is only for round, tiered and mini cakes.`);
  }
  if (design.topper && !TOPPERS.some((x) => x.id === design.topper)) add('option', 'unknown_topper', 'topper', `We don't have a topper called "${design.topper}".`);
  if (design.picture && !PICTURES.some((x) => x.id === design.picture)) add('option', 'unknown_picture', 'picture', NO_PHOTOS);
  for (const e of design.extras) if (!EXTRAS.some((x) => x.id === e)) add('option', 'unknown_extra', 'extras', `We don't have an extra called "${e}".`);

  // The brief's dietary needs must be met by the design.
  for (const diet of brief.dietary) {
    if (diet === 'gluten-free' && !design.glutenFree) add('option', 'brief_gluten_free', 'glutenFree', 'Your order says gluten-free. Change the order details first if that is no longer needed.');
    if (diet === 'vegan' && !design.vegan) add('option', 'brief_vegan', 'vegan', 'Your order says vegan. Change the order details first if that is no longer needed.');
  }

  return reasons;
}

export function check(design: Design, brief: Brief, today: string): CheckResult {
  const reasons = checkReasons(design, brief, today);
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export interface AllowedValue {
  value: string | boolean;
  label: string;
  ok: boolean;
  reason?: string;
}

/** For the quick-change controls: tries each value on a copy of the design through `check`. */
export function allowedValues(design: Design, brief: Brief, field: DesignField, today: string): AllowedValue[] {
  const tpl = template(design.template);
  if (!tpl) return [];
  const baseline = new Set(checkReasons(design, brief, today).map((r) => r.code));
  const test = (next: Design) => {
    const fresh = checkReasons(next, brief, today).filter((r) => !baseline.has(r.code));
    return fresh.length ? { ok: false, reason: fresh[0].text } : { ok: true };
  };
  if (field === 'glutenFree' || field === 'vegan') {
    return [true, false].map((value) => ({ value, label: value ? 'Yes' : 'No', ...test({ ...design, [field]: value }) }));
  }
  return optionValues(tpl.line, field).map((v) => ({ value: v.id, label: v.label, ...test(toggleValue(design, field, v.id)) }));
}
