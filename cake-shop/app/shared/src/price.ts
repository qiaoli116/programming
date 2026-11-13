// Pricing: every number comes from the catalog. The AI never sets a price.
import {
  DECORATIONS,
  DELIVERY_PRICE,
  DIETARY_PRICE,
  EXTRAS,
  FILLINGS,
  FINISHES,
  PICTURES,
  PICTURE_PRICE,
  SETUP_PRICE,
  SPONGES,
  TOPPERS,
  line,
  template,
} from './catalog';
import type { Brief, Design, Quote, QuoteLine } from './types';

export function price(design: Design, brief: Brief): Quote {
  const tpl = template(design.template);
  if (!tpl) throw new Error(`Unknown template ${design.template}`);
  const ln = line(tpl.line);
  const size = ln.sizes.find((s) => s.id === design.size);
  if (!size) throw new Error(`Unknown size ${design.size}`);

  const lines: QuoteLine[] = [{ label: `${ln.name}, ${size.label} (serves ${size.serves})`, amount: size.price }];
  const addOpt = (label: string | undefined, amount: number | undefined) => {
    if (label && amount) lines.push({ label, amount });
  };

  const sponge = SPONGES.find((s) => s.id === design.sponge);
  addOpt(sponge && `${sponge.label} sponge`, sponge?.price);
  const filling = FILLINGS.find((s) => s.id === design.filling);
  addOpt(filling && `${filling.label} filling`, filling?.price);
  const finish = FINISHES.find((s) => s.id === design.finish);
  addOpt(finish && `${finish.label} finish`, finish?.price);
  for (const d of design.decorations) {
    const dec = DECORATIONS.find((x) => x.id === d);
    addOpt(dec?.label, dec?.price);
  }
  const topper = TOPPERS.find((x) => x.id === design.topper);
  addOpt(topper?.label, topper?.price);
  if (design.picture) {
    const pic = PICTURES.find((p) => p.id === design.picture);
    addOpt(`Printed picture (${pic?.label ?? design.picture})`, PICTURE_PRICE);
  }
  if (design.glutenFree) addOpt('Gluten-free', DIETARY_PRICE['gluten-free']);
  if (design.vegan) addOpt('Vegan', DIETARY_PRICE.vegan);
  for (const e of design.extras) {
    const ex = EXTRAS.find((x) => x.id === e);
    addOpt(ex?.label, ex?.price);
  }
  if (brief.fulfilment === 'delivery') addOpt('Delivery (local area)', DELIVERY_PRICE);
  if (size.tiers === 3 && brief.fulfilment === 'delivery') addOpt('Setup at the venue', SETUP_PRICE);

  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}
