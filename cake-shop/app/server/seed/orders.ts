// Demo data (fictional): three orders waiting for the baker and two already confirmed for the same bake day.
// C-1043 (Jordan) is the worked example of devlog 03. The seed uses fixed dates around 2026-11-13.
import crypto from 'node:crypto';
import {
  applyField,
  defaultDesign,
  fittingSize,
  price,
  type Brief,
  type ChatMessage,
  type Contact,
  type Design,
  type Order,
  type OrderEvent,
  type Status,
} from '@cakeshop/shared';
import type { OrderStore } from '../src/store';

interface Spec {
  id: string;
  status: Status;
  brief: Brief;
  design: Design;
  contact: Contact;
  at: string;
  chat: [ChatMessage['kind'], string, string?][];
}

function make(template: string, brief: Brief, edit: (d: Design) => Design = (d) => d): Design {
  const base = { ...defaultDesign(template, brief), size: fittingSize(template, brief.guests) };
  return edit(base);
}

const jordanBrief: Brief = { occasion: 'kids', guests: 20, date: '2026-11-21', dietary: ['gluten-free'], fulfilment: 'pickup', slot: '10-12' };
const samBrief: Brief = { occasion: 'office', guests: 24, date: '2026-11-19', dietary: [], fulfilment: 'pickup', slot: '2-4' };
const priyaBrief: Brief = { occasion: 'wedding', guests: 50, date: '2026-12-05', dietary: [], fulfilment: 'delivery', slot: '12-2' };
const aliBrief: Brief = { occasion: 'adult', guests: 14, date: '2026-11-21', dietary: [], fulfilment: 'pickup', slot: '12-2' };
const noorBrief: Brief = { occasion: 'kids', guests: 24, date: '2026-11-21', dietary: [], fulfilment: 'pickup', slot: '2-4' };

const SPECS: Spec[] = [
  {
    id: 'C-1041',
    status: 'CONFIRMED',
    brief: aliBrief,
    design: make('drip-cake', aliBrief, (d) => ({ ...d, size: '8in', colour: 'pink', decorations: ['chocolate drip'], message: 'Happy 40th' })),
    contact: { name: 'Ali', phone: '(555) 010-0141', email: 'ali@example.com' },
    at: '2026-11-09T09:30:00.000Z',
    chat: [
      ['customer', 'A pink drip cake for my sister, she is turning 40.'],
      ['assistant', 'Happy early birthday to her! A drip cake in pink with a chocolate drip is a lovely choice. I added "Happy 40th" on top.'],
    ],
  },
  {
    id: 'C-1042',
    status: 'CONFIRMED',
    brief: noorBrief,
    design: make('rainbow-cupcakes', noorBrief, (d) => ({ ...d, size: 'box24' })),
    contact: { name: 'Noor', phone: '(555) 010-0142', email: 'noor@example.com' },
    at: '2026-11-10T14:05:00.000Z',
    chat: [
      ['customer', 'Cupcakes for my son\'s class party, 24 please.'],
      ['assistant', 'A box of 24 rainbow cupcakes is perfect for a class party.'],
    ],
  },
  {
    id: 'C-1043',
    status: 'AWAITING_BAKER',
    brief: jordanBrief,
    design: make('unicorn-round', jordanBrief, (d) => ({ ...applyField(d, 'colour', 'purple'), message: 'Happy 7th Birthday, Mia' })),
    contact: { name: 'Jordan', phone: '(555) 010-0143', email: 'jordan@example.com' },
    at: '2026-11-13T10:13:00.000Z',
    chat: [
      ['customer', "Hi! I'd like a unicorn cake for my daughter Mia's 7th birthday. About 20 kids, and it must be gluten-free. Could you make a big 3D unicorn head?"],
      ['assistant', "A 3D sculpted unicorn head is something we can't make, sorry. Here are 3 unicorn cakes we can make, all gluten-free."],
      ['customer', 'I choose "Unicorn round, white".'],
      ['customer', 'We love A! Can you write "Happy 7th Birthday, Mia" on it?'],
      ['ui', 'colour white → purple'],
      ['assistant', 'I see you changed the colour to purple. A rainbow drip would look great with it.'],
    ],
  },
  {
    id: 'C-1044',
    status: 'AWAITING_BAKER',
    brief: priyaBrief,
    design: make('classic-white-tiered', priyaBrief, (d) => ({ ...d, size: '2t50', decorations: ['fresh flowers'] })),
    contact: { name: 'Priya', phone: '(555) 010-0144', email: 'priya@example.com' },
    at: '2026-11-12T16:40:00.000Z',
    chat: [
      ['customer', 'We need a classic white wedding cake for about 50 guests, delivered.'],
      ['assistant', 'A classic white tiered cake with fresh flowers suits that well. Two large tiers serve 50.'],
    ],
  },
  {
    id: 'C-1045',
    status: 'AWAITING_BAKER',
    brief: samBrief,
    design: make('picture-sheet', samBrief, (d) => ({ ...d, picture: 'logo', message: 'Team lunch' })),
    contact: { name: 'Sam', phone: '(555) 010-0145', email: 'sam@example.com' },
    at: '2026-11-13T08:50:00.000Z',
    chat: [
      ['customer', 'A sheet cake with our logo for the team lunch next Thursday, 24 people.'],
      ['assistant', 'A half sheet with your logo printed on it serves 24. I added "Team lunch" beside the logo.'],
    ],
  },
];

export function seedOrders(store: OrderStore): number {
  let n = 0;
  for (const s of SPECS) {
    if (store.get(s.id)) continue;
    const chat: ChatMessage[] = s.chat.map(([kind, text], i) => ({
      id: i + 1,
      kind,
      text,
      at: s.at,
      ...(kind === 'ui' ? { change: text } : {}),
    }));
    const events: OrderEvent[] = [
      { at: s.at, by: 'customer', type: 'status', text: 'DESIGNING → AWAITING_BAKER. The customer confirmed the final design.' },
      { at: s.at, by: 'server', type: 'notice', text: `Email to ${s.contact.email}: we have your design and our baker is checking it.` },
    ];
    const quote = price(s.design, s.brief);
    const order: Order = {
      id: s.id,
      token: crypto.randomBytes(32).toString('base64url'),
      status: s.status,
      brief: s.brief,
      chat,
      options: [],
      design: { ...s.design, version: 1 },
      quote,
      contact: s.contact,
      approval: s.status === 'CONFIRMED' ? { decision: 'approved', at: s.at } : null,
      confirmation: s.status === 'CONFIRMED' ? { paid: 'simulated', amount: quote.total, at: s.at } : null,
      events:
        s.status === 'CONFIRMED'
          ? [...events, { at: s.at, by: 'baker', type: 'status', text: 'AWAITING_BAKER → CONFIRMED. The baker approved the order.' }]
          : events,
      createdAt: s.at,
      updatedAt: s.at,
      jobs: [],
      lastCustomerAt: s.at,
    };
    store.insert(order);
    n++;
  }
  return n;
}
