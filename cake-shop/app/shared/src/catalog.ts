// The bakery's catalog as typed data (devlog 03). The AI prompt, the rules and the screens all read this file.
import type { ColourId, DesignField, LineId, OccasionId } from './types';

export interface OptionValue {
  id: string;
  label: string;
  price: number;
  /** Lines it is limited to. Omit for all lines. */
  lines?: LineId[];
}

export interface Size {
  id: string;
  label: string;
  serves: number;
  price: number;
  /** Minimum notice in days when it differs from the line's (3 tiers need 14). */
  noticeDays?: number;
  /** Tiers of a tiered cake. */
  tiers?: number;
}

export interface ProductLine {
  id: LineId;
  name: string;
  sizes: Size[];
  noticeDays: number;
  /** Option groups that apply to the line (dietary and extras apply to every line). */
  groups: DesignField[];
  maxDecorations: number;
  /** Longest message. 0 means the line takes no message. */
  messageMax: number;
  glutenFree: boolean;
  vegan: boolean;
  finishRequired?: boolean;
  /** Short note for the customer. */
  blurb: string;
}

export interface Template {
  id: string;
  name: string;
  line: LineId;
  occasions: OccasionId[];
  /** Parts of the design itself. They can't be removed or changed. */
  fixed: Partial<TemplateDesign>;
  /** Values a new design starts with. */
  defaults: Partial<TemplateDesign>;
  /** Fields the customer may change. Anything else is locked to the fixed or default value. */
  changeable: DesignField[];
  /** Fields that must have a value. */
  required?: DesignField[];
  /** Colours the template allows. Omit for the whole palette. */
  palette?: ColourId[];
  /** Decorations: at least one of these is needed (the drip cake). */
  requireOneOf?: { field: 'decorations'; values: string[] };
  /** Seasonal window (MM-DD), checked against the pickup date. */
  season?: { from: string; to: string };
  /** Parts the picture draws that are not options (a ribbon on the classic tiered cake). */
  look?: string[];
  blurb: string;
}

type TemplateDesign = {
  size: string;
  sponge: string;
  filling: string;
  finish: string;
  colour: ColourId;
  decorations: string[];
  topper: string;
  message: string;
  picture: string;
  digits: string;
};

export interface Occasion {
  id: OccasionId;
  label: string;
  /** What the designer asks first. */
  ask: string;
}

export const OCCASIONS: Occasion[] = [
  { id: 'kids', label: "Kids' birthday", ask: 'age, theme or favourite character, number of kids' },
  { id: 'adult', label: 'Adult birthday', ask: 'age (milestone?), style (elegant or fun)' },
  { id: 'wedding', label: 'Wedding and anniversary', ask: 'guest count, colour scheme, venue (delivery and setup)' },
  { id: 'baby', label: 'Baby and family', ask: 'boy, girl or surprise, colours' },
  { id: 'achievement', label: 'Achievement', ask: 'what the achievement is, school or team colours' },
  { id: 'office', label: 'Office and events', ask: 'headcount, logo (printed picture)' },
  { id: 'seasonal', label: 'Seasonal', ask: 'only offered in its season' },
  { id: 'justbecause', label: 'Just because', ask: 'who it is for, a short message' },
];

export const COLOURS: { id: ColourId; label: string; hex: string }[] = [
  { id: 'white', label: 'White', hex: '#fbf8f2' },
  { id: 'pink', label: 'Pink', hex: '#f6b3c6' },
  { id: 'purple', label: 'Purple', hex: '#b79be8' },
  { id: 'blue', label: 'Blue', hex: '#9fcbf2' },
  { id: 'yellow', label: 'Yellow', hex: '#f6df86' },
  { id: 'mint', label: 'Mint', hex: '#a6e2c6' },
  { id: 'chocolate', label: 'Chocolate', hex: '#7a4b32' },
  { id: 'black', label: 'Black', hex: '#3a3a3a' },
];

export const LINES: ProductLine[] = [
  {
    id: 'cupcakes',
    name: 'Cupcakes',
    sizes: [
      { id: 'box6', label: 'Box of 6', serves: 6, price: 18 },
      { id: 'box12', label: 'Box of 12', serves: 12, price: 32 },
      { id: 'box24', label: 'Box of 24', serves: 24, price: 60 },
    ],
    noticeDays: 2,
    groups: ['size', 'sponge', 'colour', 'decorations', 'topper'],
    maxDecorations: 1,
    messageMax: 0,
    glutenFree: true,
    vegan: true,
    blurb: 'Easy to share. A message card is an extra.',
  },
  {
    id: 'mini',
    name: 'Mini cake',
    sizes: [{ id: '4in', label: '4"', serves: 4, price: 28 }],
    noticeDays: 2,
    groups: ['size', 'sponge', 'filling', 'colour', 'decorations', 'message'],
    maxDecorations: 1,
    messageMax: 20,
    glutenFree: true,
    vegan: true,
    blurb: 'A small cake with a short message on top.',
  },
  {
    id: 'round',
    name: 'Round cake',
    sizes: [
      { id: '6in', label: '6"', serves: 8, price: 40 },
      { id: '8in', label: '8"', serves: 16, price: 60 },
      { id: '10in', label: '10"', serves: 24, price: 85 },
    ],
    noticeDays: 3,
    groups: ['size', 'sponge', 'filling', 'finish', 'colour', 'decorations', 'topper', 'message', 'picture'],
    maxDecorations: 2,
    messageMax: 30,
    glutenFree: true,
    vegan: true,
    blurb: 'Our most flexible line.',
  },
  {
    id: 'number',
    name: 'Number cake',
    sizes: [
      { id: 'n1', label: '1 character', serves: 12, price: 55 },
      { id: 'n2', label: '2 characters', serves: 24, price: 100 },
    ],
    noticeDays: 3,
    groups: ['size', 'sponge', 'colour', 'decorations', 'digits'],
    maxDecorations: 2,
    messageMax: 0,
    glutenFree: true,
    vegan: true,
    blurb: 'Digits or letters, with toppings. No message and no topper.',
  },
  {
    id: 'sheet',
    name: 'Sheet cake',
    sizes: [
      { id: 'half', label: 'Half sheet', serves: 24, price: 70 },
      { id: 'full', label: 'Full sheet', serves: 48, price: 120 },
    ],
    noticeDays: 3,
    groups: ['size', 'sponge', 'filling', 'colour', 'decorations', 'message', 'picture'],
    maxDecorations: 2,
    messageMax: 40,
    glutenFree: true,
    vegan: true,
    blurb: 'Best value per slice, and easy to cut.',
  },
  {
    id: 'tiered',
    name: 'Tiered cake',
    sizes: [
      { id: '2t30', label: '2 tiers', serves: 30, price: 150, tiers: 2 },
      { id: '2t50', label: '2 tiers, large', serves: 50, price: 220, tiers: 2 },
      { id: '3t80', label: '3 tiers', serves: 80, price: 340, noticeDays: 14, tiers: 3 },
      { id: '3t120', label: '3 tiers, large', serves: 120, price: 480, noticeDays: 14, tiers: 3 },
    ],
    noticeDays: 7,
    groups: ['size', 'sponge', 'filling', 'finish', 'colour', 'decorations', 'topper', 'message'],
    maxDecorations: 2,
    messageMax: 30,
    glutenFree: false,
    vegan: false,
    finishRequired: true,
    blurb: 'For weddings and big days. No gluten-free; 3 tiers are delivered and set up.',
  },
];

export const SPONGES: OptionValue[] = [
  { id: 'vanilla', label: 'Vanilla', price: 0 },
  { id: 'chocolate', label: 'Chocolate', price: 0 },
  { id: 'lemon', label: 'Lemon', price: 0 },
  { id: 'red-velvet', label: 'Red velvet', price: 8 },
  { id: 'carrot', label: 'Carrot', price: 8 },
];
/** Sponges a vegan cake may use. */
export const VEGAN_SPONGES = ['vanilla', 'chocolate'];

export const FILLINGS: OptionValue[] = [
  { id: 'buttercream', label: 'Buttercream', price: 0 },
  { id: 'jam', label: 'Jam', price: 4 },
  { id: 'chocolate-ganache', label: 'Chocolate ganache', price: 8 },
  { id: 'lemon-curd', label: 'Lemon curd', price: 6 },
];

export const FINISHES: OptionValue[] = [
  { id: 'buttercream', label: 'Buttercream', price: 0 },
  { id: 'semi-naked', label: 'Semi-naked', price: 0 },
  { id: 'fondant', label: 'Fondant', price: 30, lines: ['round', 'tiered'] },
];

export const DECORATIONS: OptionValue[] = [
  { id: 'sprinkles', label: 'Sprinkles', price: 0 },
  { id: 'rainbow drip', label: 'Rainbow drip', price: 10, lines: ['round', 'tiered', 'mini'] },
  { id: 'chocolate drip', label: 'Chocolate drip', price: 10, lines: ['round', 'tiered', 'mini'] },
  { id: 'rosettes', label: 'Rosettes', price: 8 },
  { id: 'fresh flowers', label: 'Fresh flowers', price: 15 },
  { id: 'macarons', label: 'Macarons', price: 14 },
  { id: 'fruit', label: 'Fruit', price: 10 },
  { id: 'gold leaf', label: 'Gold leaf', price: 12 },
];
export const DRIPS = ['rainbow drip', 'chocolate drip'];

export const TOPPERS: OptionValue[] = [
  { id: 'unicorn', label: 'Unicorn topper', price: 12 },
  { id: 'dinosaur', label: 'Dinosaur topper', price: 12 },
  { id: 'crown', label: 'Crown topper', price: 12 },
  { id: 'grad-cap', label: 'Grad cap topper', price: 12 },
  { id: 'number-candles', label: 'Number candles', price: 4 },
];

export const PICTURE_PRICE = 12;
/** Edible prints of a picture the customer owns, from our library. No photos of people. */
export const PICTURES: { id: string; label: string }[] = [
  { id: 'unicorn', label: 'Unicorn' },
  { id: 'dinosaur', label: 'Dinosaur' },
  { id: 'football', label: 'Football' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'logo', label: 'Your own logo' },
];

export const DIETARY_PRICE = { 'gluten-free': 15, vegan: 15 } as const;

export const EXTRAS: OptionValue[] = [
  { id: 'candles', label: 'Candles', price: 3 },
  { id: 'message-card', label: 'Message card', price: 2 },
  { id: 'gift-box', label: 'Gift box', price: 5 },
];

export const DELIVERY_PRICE = 10;
export const SETUP_PRICE = 25;

export const SHOP = {
  minNoticeDays: 2,
  maxTiers: 3,
  /** Orders confirmed with no customer activity for this long are abandoned. */
  abandonDays: 7,
};

export const SLOTS: { id: string; label: string }[] = [
  { id: '10-12', label: '10:00 – 12:00' },
  { id: '12-2', label: '12:00 – 14:00' },
  { id: '2-4', label: '14:00 – 16:00' },
];

export const TEMPLATES: Template[] = [
  {
    id: 'unicorn-round',
    name: 'Unicorn round',
    line: 'round',
    occasions: ['kids'],
    fixed: { topper: 'unicorn' },
    defaults: { size: '10in', sponge: 'vanilla', filling: 'buttercream', finish: 'buttercream', colour: 'white', decorations: [], message: '' },
    changeable: ['size', 'sponge', 'filling', 'colour', 'decorations', 'message'],
    blurb: 'A round cake with a unicorn topper. Pick the colour and up to 2 decorations.',
  },
  {
    id: 'dinosaur-round',
    name: 'Dinosaur round',
    line: 'round',
    occasions: ['kids'],
    fixed: { topper: 'dinosaur' },
    defaults: { size: '10in', sponge: 'chocolate', filling: 'buttercream', finish: 'buttercream', colour: 'mint', decorations: [], message: '' },
    changeable: ['size', 'sponge', 'filling', 'colour', 'message'],
    palette: ['mint', 'yellow', 'chocolate'],
    blurb: 'A round cake with a dinosaur topper, in greens and earth tones.',
  },
  {
    id: 'picture-sheet',
    name: 'Picture sheet',
    line: 'sheet',
    occasions: ['kids', 'office', 'achievement'],
    fixed: {},
    defaults: { size: 'half', sponge: 'vanilla', filling: 'buttercream', colour: 'white', decorations: [], message: '', picture: 'unicorn' },
    changeable: ['size', 'sponge', 'colour', 'decorations', 'message', 'picture'],
    required: ['picture'],
    blurb: 'A sheet cake with a printed picture. The best value for a crowd.',
  },
  {
    id: 'sweet-number',
    name: 'Sweet number',
    line: 'number',
    occasions: ['kids', 'adult'],
    fixed: { decorations: ['macarons'] },
    defaults: { size: 'n1', sponge: 'vanilla', colour: 'pink', decorations: ['macarons'], digits: '7' },
    changeable: ['size', 'sponge', 'colour', 'digits'],
    required: ['digits'],
    blurb: 'A number (or letters) cake covered in sweets.',
  },
  {
    id: 'drip-cake',
    name: 'Drip cake',
    line: 'round',
    occasions: ['adult'],
    fixed: {},
    defaults: { size: '8in', sponge: 'chocolate', filling: 'chocolate-ganache', finish: 'buttercream', colour: 'white', decorations: ['chocolate drip'], message: '' },
    changeable: ['size', 'sponge', 'filling', 'colour', 'decorations', 'topper', 'message'],
    requireOneOf: { field: 'decorations', values: ['rainbow drip', 'chocolate drip'] },
    blurb: 'A round cake with a drip. Choose the drip colour and a topper.',
  },
  {
    id: 'message-mini',
    name: 'Message mini',
    line: 'mini',
    occasions: ['adult', 'wedding', 'justbecause'],
    fixed: {},
    defaults: { size: '4in', sponge: 'vanilla', filling: 'buttercream', colour: 'pink', decorations: [], message: 'Thank you' },
    changeable: ['sponge', 'filling', 'colour', 'message'],
    required: ['message'],
    blurb: 'A mini cake with your short message piped on top.',
  },
  {
    id: 'classic-white-tiered',
    name: 'Classic white tiered',
    line: 'tiered',
    occasions: ['wedding'],
    fixed: { finish: 'fondant', colour: 'white' },
    defaults: { size: '2t30', sponge: 'vanilla', filling: 'buttercream', finish: 'fondant', colour: 'white', decorations: [], message: '' },
    changeable: ['size', 'sponge', 'decorations'],
    palette: ['white'],
    look: ['ribbon'],
    blurb: 'White fondant and a ribbon. Add flowers if you like.',
  },
  {
    id: 'rainbow-cupcakes',
    name: 'Rainbow cupcakes',
    line: 'cupcakes',
    occasions: ['kids', 'office'],
    fixed: { decorations: ['sprinkles'] },
    defaults: { size: 'box12', sponge: 'vanilla', colour: 'white', decorations: ['sprinkles'] },
    changeable: ['size', 'sponge'],
    blurb: 'Cupcakes with rainbow sprinkles, in a box of 6, 12 or 24.',
  },
];

export function line(id: LineId): ProductLine {
  const found = LINES.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown line ${id}`);
  return found;
}
export function template(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
export function sizeOf(lineId: LineId, sizeId: string): Size | undefined {
  return line(lineId).sizes.find((s) => s.id === sizeId);
}
export function occasion(id: OccasionId): Occasion {
  return OCCASIONS.find((o) => o.id === id) ?? OCCASIONS[0];
}
export function templatesFor(occasionId: OccasionId): Template[] {
  return TEMPLATES.filter((t) => t.occasions.includes(occasionId));
}

/** The value list behind a field for a product line (the picture, colour and size lists). */
export function optionValues(lineId: LineId, field: DesignField): OptionValue[] {
  const byLine = (list: OptionValue[]) => list.filter((v) => !v.lines || v.lines.includes(lineId));
  switch (field) {
    case 'sponge':
      return SPONGES;
    case 'filling':
      return FILLINGS;
    case 'finish':
      return byLine(FINISHES);
    case 'decorations':
      return byLine(DECORATIONS);
    case 'topper':
      return TOPPERS;
    case 'extras':
      return EXTRAS;
    case 'size':
      return line(lineId).sizes.map((s) => ({ id: s.id, label: s.label, price: s.price }));
    case 'colour':
      return COLOURS.map((c) => ({ id: c.id, label: c.label, price: 0 }));
    case 'picture':
      return PICTURES.map((p) => ({ id: p.id, label: p.label, price: PICTURE_PRICE }));
    default:
      return [];
  }
}

export function labelOf(field: DesignField, id: string): string {
  const lists: Record<string, OptionValue[]> = {
    sponge: SPONGES,
    filling: FILLINGS,
    finish: FINISHES,
    decorations: DECORATIONS,
    topper: TOPPERS,
    extras: EXTRAS,
  };
  if (field === 'colour') return COLOURS.find((c) => c.id === id)?.label ?? id;
  if (field === 'picture') return PICTURES.find((p) => p.id === id)?.label ?? id;
  if (field === 'size') {
    for (const l of LINES) {
      const s = l.sizes.find((x) => x.id === id);
      if (s) return s.label;
    }
  }
  return lists[field]?.find((v) => v.id === id)?.label ?? id;
}
