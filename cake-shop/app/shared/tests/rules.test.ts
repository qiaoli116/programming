import { describe, expect, it } from 'vitest';
import {
  TEMPLATES,
  allowedValues,
  applyField,
  check,
  defaultDesign,
  drawCake,
  price,
  sizeWarning,
  suggestTemplates,
  type Brief,
  type Design,
} from '../src';

const TODAY = '2026-11-13';
const brief: Brief = { occasion: 'kids', guests: 20, date: '2026-11-21', dietary: ['gluten-free'], fulfilment: 'pickup' };

const unicorn = (over: Partial<Design> = {}): Design => ({ ...defaultDesign('unicorn-round', brief), ...over });
const reasonCodes = (d: Design, b: Brief = brief) => {
  const r = check(d, b, TODAY);
  return r.ok ? [] : r.reasons.map((x) => x.code);
};

describe('price: the worked example', () => {
  it('A: Unicorn round 10", white, gluten-free = $112', () => {
    expect(price(unicorn(), brief).total).toBe(112);
    expect(check(unicorn(), brief, TODAY).ok).toBe(true);
  });
  it('B: purple with a rainbow drip = $122', () => {
    const d = unicorn({ colour: 'purple', decorations: ['rainbow drip'] });
    expect(check(d, brief, TODAY).ok).toBe(true);
    expect(price(d, brief).total).toBe(122);
  });
  it('C: Picture sheet (half) with the unicorn picture, gluten-free = $97', () => {
    const d = defaultDesign('picture-sheet', brief);
    expect(check(d, brief, TODAY).ok).toBe(true);
    expect(price(d, brief).total).toBe(97);
  });
  it('lines add up to the total, and delivery is added', () => {
    const q = price(unicorn(), { ...brief, fulfilment: 'delivery' });
    expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.total);
    expect(q.total).toBe(122);
  });
});

describe('check', () => {
  it('rejects red velvet with gluten-free', () => {
    expect(reasonCodes(unicorn({ sponge: 'red-velvet' }))).toContain('gf_red_velvet');
  });
  it('rejects gluten-free tiered cakes', () => {
    const b: Brief = { ...brief, occasion: 'wedding', guests: 30, date: '2026-12-01' };
    const d = defaultDesign('classic-white-tiered', b);
    expect(reasonCodes(d, b)).toContain('gf_line');
  });
  it('rejects 3 tiers with pickup, accepts them with delivery and 14 days', () => {
    const b: Brief = { occasion: 'wedding', guests: 80, date: '2026-11-25', dietary: [], fulfilment: 'pickup' };
    const d = { ...defaultDesign('classic-white-tiered', b), size: '3t80' };
    expect(reasonCodes(d, b)).toEqual(expect.arrayContaining(['tiers_delivery', 'notice']));
    const ok: Brief = { ...b, date: '2026-12-01', fulfilment: 'delivery' };
    expect(check(d, ok, TODAY).ok).toBe(true);
    expect(price(d, ok).lines.some((l) => l.label.startsWith('Setup'))).toBe(true);
  });
  it('rejects 1 day of notice, and the line minimum', () => {
    expect(reasonCodes(unicorn(), { ...brief, date: '2026-11-14' })).toContain('notice');
    expect(reasonCodes(unicorn(), { ...brief, date: '2026-11-15' })).toContain('notice');
    expect(reasonCodes(unicorn(), { ...brief, date: '2026-11-16' })).not.toContain('notice');
  });
  it('limits decorations (2 on a round, 1 on a mini)', () => {
    expect(reasonCodes(unicorn({ decorations: ['sprinkles', 'rosettes', 'fruit'] }))).toContain('too_many_decorations');
    const b: Brief = { ...brief, dietary: [] };
    const mini = { ...defaultDesign('message-mini', b), decorations: ['sprinkles', 'fruit'] };
    expect(reasonCodes(mini, b)).toContain('too_many_decorations');
  });
  it("the unicorn topper can't be removed or swapped", () => {
    expect(reasonCodes(unicorn({ topper: undefined }))).toContain('locked_topper');
    expect(reasonCodes(unicorn({ topper: 'crown' }))).toContain('locked_topper');
  });
  it('limits message length by line', () => {
    expect(reasonCodes(unicorn({ message: 'x'.repeat(31) }))).toContain('message_too_long');
    expect(reasonCodes(unicorn({ message: 'x'.repeat(30) }))).not.toContain('message_too_long');
  });
  it('returns every reason, not just the first', () => {
    const codes = reasonCodes(unicorn({ sponge: 'red-velvet', message: 'x'.repeat(40), decorations: ['sprinkles', 'rosettes', 'fruit'] }), { ...brief, date: '2026-11-14' });
    expect(codes).toEqual(expect.arrayContaining(['gf_red_velvet', 'message_too_long', 'too_many_decorations', 'notice']));
  });
  it('vegan needs vanilla or chocolate', () => {
    const b: Brief = { ...brief, dietary: ['vegan'] };
    expect(reasonCodes({ ...defaultDesign('unicorn-round', b), sponge: 'lemon' }, b)).toContain('vegan_sponge');
  });
  it('fondant and drips are limited to the right lines, pictures to sheet and round', () => {
    const b: Brief = { ...brief, dietary: [] };
    const cup = defaultDesign('rainbow-cupcakes', b);
    expect(reasonCodes({ ...cup, finish: 'fondant' }, b)).toContain('no_finish');
    expect(reasonCodes({ ...cup, decorations: ['rainbow drip'] }, b)).toContain('drip_line');
    expect(reasonCodes({ ...cup, picture: 'unicorn' }, b)).toContain('picture_line');
  });
  it('the brief dietary need must be met by the design', () => {
    expect(reasonCodes(unicorn({ glutenFree: false }))).toContain('brief_gluten_free');
  });
  it('the number cake limits digits to its size', () => {
    const b: Brief = { ...brief, dietary: [] };
    const d = { ...defaultDesign('sweet-number', b), digits: '12' };
    expect(reasonCodes(d, b)).toContain('digits_length');
  });
});

describe('allowedValues', () => {
  it('marks red velvet as not allowed when gluten-free is on, with the same reason', () => {
    const vals = allowedValues(unicorn(), brief, 'sponge', TODAY);
    const rv = vals.find((v) => v.value === 'red-velvet')!;
    expect(rv.ok).toBe(false);
    const direct = check(unicorn({ sponge: 'red-velvet' }), brief, TODAY);
    expect(direct.ok === false && direct.reasons.find((r) => r.code === 'gf_red_velvet')!.text).toBe(rv.reason);
    expect(vals.find((v) => v.value === 'lemon')!.ok).toBe(true);
  });
  it('shows the current value as allowed and locked fields as disallowed', () => {
    const toppers = allowedValues(unicorn(), brief, 'topper', TODAY);
    expect(toppers.find((v) => v.value === 'unicorn')!.ok).toBe(true);
    expect(toppers.find((v) => v.value === 'crown')!.ok).toBe(false);
  });
});

describe('sizeWarning', () => {
  it('fires for an 8" round and 20 guests, not for a 10" round', () => {
    expect(sizeWarning(unicorn({ size: '8in' }), brief)).toBe('A 8" round serves 16. Your order says 20 guests.');
    expect(sizeWarning(unicorn({ size: '10in' }), brief)).toBeNull();
  });
});

describe('drawCake', () => {
  it('draws every template with defaults, without throwing', () => {
    for (const t of TEMPLATES) {
      const b: Brief = { ...brief, occasion: t.occasions[0], dietary: [] };
      const svg = drawCake(defaultDesign(t.id, b));
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.length).toBeGreaterThan(300);
    }
  });
  it('escapes customer text', () => {
    const svg = drawCake(unicorn({ message: '<script>alert(1)</script>' }));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    const n = drawCake({ ...defaultDesign('sweet-number', brief), digits: '<b>' });
    expect(n).not.toContain('<b>');
  });
});

describe('templates', () => {
  it('every template default passes the checker for its own occasion and dietary-free brief', () => {
    for (const t of TEMPLATES) {
      const b: Brief = { occasion: t.occasions[0], guests: 5, date: '2026-12-20', dietary: [], fulfilment: 'delivery' };
      const r = check(defaultDesign(t.id, b), b, TODAY);
      expect(r, t.id).toEqual({ ok: true });
    }
  });
  it('suggests the worked-example options for the kids brief', () => {
    const ids = suggestTemplates(brief).map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['unicorn-round', 'picture-sheet']));
    expect(ids).not.toContain('classic-white-tiered');
  });
  it('applyField toggles lists and sets values', () => {
    const d = applyField(unicorn(), 'decorations', ['sprinkles']);
    expect(d.decorations).toEqual(['sprinkles']);
    expect(applyField(d, 'colour', 'purple').colour).toBe('purple');
  });
});
