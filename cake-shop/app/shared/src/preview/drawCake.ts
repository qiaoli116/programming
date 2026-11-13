// The Preview agent: draws the cake from a design as SVG. Ported from the demo's cake-preview.js.
// The output is set as HTML in the browser, so every piece of customer text goes through esc().
import { COLOURS, line, template } from '../catalog';
import type { Design } from '../types';

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255];
  return '#' + ch.map((v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt).toString(16).padStart(2, '0')).join('');
}
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const RAIN = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
const SPRINKLES = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#ffd166', '#c77dff'];

function flower(x: number, y: number, r: number, c: string): string {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    s += `<circle cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="${(r * 0.75).toFixed(1)}" fill="${c}"/>`;
  }
  return s + `<circle cx="${x}" cy="${y}" r="${(r * 0.55).toFixed(1)}" fill="#ffd166"/>`;
}
const textStyle = (fill: string, size: number | string, family?: string, weight?: string) =>
  `style="fill:${fill};font:${weight || 'italic 700'} ${size}px ${family || "'Segoe Script','Brush Script MT',cursive"}"`;

interface Ctx {
  uid: number;
}
type Opt = { topper: boolean; message: boolean };

function drips(d: Design): 'rain' | 'choc' | null {
  return d.decorations.includes('rainbow drip') ? 'rain' : d.decorations.includes('chocolate drip') ? 'choc' : null;
}

function tierSvg(ctx: Ctx, cx: number, bottom: number, w: number, h: number, d: Design, col: string, opt: Opt, look: string[]): string {
  const rx = w / 2;
  const ry = Math.round(w * 0.11);
  const top = bottom - h;
  const L = cx - rx;
  const R = cx + rx;
  const dark = shade(col, -0.22);
  const light = shade(col, 0.3);
  const decs = d.decorations;
  const fy = (x: number) => top + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  const fb = (x: number) => bottom + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  let s = `<path d="M${L} ${top} V${bottom} A${rx} ${ry} 0 0 0 ${R} ${bottom} V${top} Z" fill="${col}" stroke="${dark}" stroke-width="2"/>`;
  if (d.finish === 'fondant') s += `<path d="M${L + 12} ${top + ry + 6} V${bottom - 4}" stroke="${light}" stroke-width="7" stroke-linecap="round" opacity=".9"/>`;
  if (decs.includes('sprinkles')) {
    const r = rng(7 + w);
    for (let i = 0; i < 34; i++) {
      const x = L + 10 + r() * (w - 20);
      const y = fy(x) + 12 + r() * (h - 16);
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="7" height="2.6" rx="1.3" fill="${SPRINKLES[i % 6]}" transform="rotate(${Math.round(r() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
  }
  if (look.includes('ribbon')) s += `<path d="M${L} ${bottom - 20} A${rx} ${ry} 0 0 0 ${R} ${bottom - 20} V${bottom - 8} A${rx} ${ry} 0 0 1 ${L} ${bottom - 8} Z" fill="#c9a227" stroke="#a07f17" stroke-width="1"/>`;
  const drip = drips(d);
  s += `<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="${drip === 'choc' ? '#5a3522' : light}" stroke="${drip === 'choc' ? '#3d2416' : dark}" stroke-width="2"/>`;
  if (drip) {
    const n = Math.max(6, Math.round(w / 17));
    for (let i = 0; i < n; i++) {
      const x = L + 7 + (i * (w - 14)) / (n - 1);
      const len = 10 + ((i * 5) % 4) * 6;
      s += `<rect x="${(x - 5).toFixed(1)}" y="${(fy(x) - 6).toFixed(1)}" width="10" height="${len + 6}" rx="5" fill="${drip === 'choc' ? '#5a3522' : RAIN[i % 6]}"/>`;
    }
    if (drip === 'rain') {
      const g = 'g' + ctx.uid++;
      s += `<defs><linearGradient id="${g}">${RAIN.map((c, i) => `<stop offset="${(i / 5).toFixed(1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs><path d="M${L} ${top} A${rx} ${ry} 0 0 0 ${R} ${top} V${top + 6} A${rx} ${ry} 0 0 1 ${L} ${top + 6} Z" fill="url(#${g})"/>`;
    } else {
      s += `<path d="M${L} ${top} A${rx} ${ry} 0 0 0 ${R} ${top} V${top + 6} A${rx} ${ry} 0 0 1 ${L} ${top + 6} Z" fill="#5a3522"/>`;
    }
  }
  if (decs.includes('rosettes')) {
    const n = Math.max(3, Math.round(w / 20));
    for (let i = 0; i < n; i++) {
      const x = L + 8 + (i * (w - 16)) / (n - 1);
      s += `<circle cx="${x.toFixed(1)}" cy="${fy(x).toFixed(1)}" r="8" fill="${light}" stroke="${dark}" stroke-width="1.5"/><circle cx="${x.toFixed(1)}" cy="${fy(x).toFixed(1)}" r="3" fill="none" stroke="${dark}"/>`;
      s += `<circle cx="${x.toFixed(1)}" cy="${(fb(x) - 4).toFixed(1)}" r="7" fill="${light}" stroke="${dark}" stroke-width="1.5"/>`;
    }
  }
  if (decs.includes('macarons')) {
    for (let i = 0; i < 5; i++) {
      const x = cx - rx * 0.7 + (i * rx * 1.4) / 4;
      s += `<ellipse cx="${x.toFixed(1)}" cy="${(fy(x) + 2).toFixed(1)}" rx="7" ry="3.5" fill="#f6b3c6"/><ellipse cx="${x.toFixed(1)}" cy="${(fy(x) + 6).toFixed(1)}" rx="7" ry="3.5" fill="#d986a3"/>`;
    }
  }
  if (decs.includes('fruit')) {
    for (let i = 0; i < 5; i++) {
      const x = cx - rx * 0.6 + (i * rx * 1.2) / 4;
      s += `<circle cx="${x.toFixed(1)}" cy="${(fy(x) - 1).toFixed(1)}" r="5.5" fill="${i % 2 ? '#3a5ba0' : '#d62839'}"/>`;
    }
  }
  if (decs.includes('gold leaf')) {
    for (let i = 0; i < 9; i++) s += `<polygon points="${L + 14 + i * ((w - 28) / 8)},${top + 18 + (i % 3) * 14} ${L + 21 + i * ((w - 28) / 8)},${top + 22 + (i % 3) * 14} ${L + 15 + i * ((w - 28) / 8)},${top + 28 + (i % 3) * 14}" fill="#e6b422" opacity=".85"/>`;
  }
  if (opt.message && d.message) {
    const fs = Math.min(18, (w - 30) / (d.message.length * 0.64));
    const ink = lum(col) > 0.55 ? '#8a2b4c' : '#ffffff';
    s += `<text x="${cx}" y="${(opt.topper ? top + ry + (h - ry) * 0.62 : bottom + ry - 25).toFixed(1)}" text-anchor="middle" ${textStyle(ink, fs.toFixed(1))}>${esc(d.message)}</text>`;
  }
  if (d.picture && opt.topper) s += pictureSvg(ctx, d.picture, cx - 30, top + ry + 4, 60, h - ry - 14);
  if (opt.topper && decs.includes('fresh flowers')) {
    s += flower(cx - rx * 0.55, top + 2, 8, '#f28482') + flower(cx - rx * 0.32, top + ry * 0.7, 7, '#e5989b') + flower(cx + rx * 0.5, top + ry * 0.4, 8, '#f6bd60');
  }
  if (opt.topper) s += topperSvg(d, cx, top);
  return s;
}

function topperSvg(d: Design, cx: number, top: number): string {
  switch (d.topper) {
    case 'unicorn':
      return `
      <polygon points="${cx - 44},${top + 2} ${cx - 24},${top} ${cx - 38},${top - 28}" fill="#fff" stroke="#c8c8c8" stroke-width="1.5"/>
      <polygon points="${cx - 39},${top - 2} ${cx - 29},${top - 2} ${cx - 36},${top - 17}" fill="#f6b3c6"/>
      <polygon points="${cx + 44},${top + 2} ${cx + 24},${top} ${cx + 38},${top - 28}" fill="#fff" stroke="#c8c8c8" stroke-width="1.5"/>
      <polygon points="${cx + 39},${top - 2} ${cx + 29},${top - 2} ${cx + 36},${top - 17}" fill="#f6b3c6"/>
      <polygon points="${cx - 12},${top + 3} ${cx + 12},${top + 3} ${cx},${top - 70}" fill="#f2c94c" stroke="#b8860b" stroke-width="1.5"/>
      <path d="M${cx - 9} ${top - 8} L${cx + 10} ${top - 16} M${cx - 7} ${top - 24} L${cx + 8} ${top - 31} M${cx - 5} ${top - 40} L${cx + 5} ${top - 45}" stroke="#b8860b" stroke-width="1.5"/>`;
    case 'dinosaur':
      return `<g transform="translate(${cx - 40} ${top - 58})">
      <path d="M10 46 Q14 22 40 22 Q58 22 62 8 Q64 0 74 2 Q82 4 78 12 L70 16 Q68 40 50 46 Z" fill="#6cbf5f" stroke="#3d7a35" stroke-width="1.5"/>
      <path d="M24 24 l4 -9 l4 8 M34 22 l4 -9 l4 8 M44 22 l4 -8 l3 8" fill="#3d7a35"/>
      <rect x="20" y="42" width="8" height="14" fill="#6cbf5f" stroke="#3d7a35"/><rect x="44" y="42" width="8" height="14" fill="#6cbf5f" stroke="#3d7a35"/>
      <circle cx="73" cy="7" r="1.8" fill="#1d2330"/><path d="M10 46 Q0 50 -6 42" stroke="#3d7a35" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
    case 'crown':
      return `<polygon points="${cx - 30},${top + 2} ${cx - 34},${top - 34} ${cx - 17},${top - 16} ${cx},${top - 42} ${cx + 17},${top - 16} ${cx + 34},${top - 34} ${cx + 30},${top + 2}" fill="#f2c94c" stroke="#b8860b" stroke-width="2"/>
      <circle cx="${cx}" cy="${top - 12}" r="4" fill="#e63946"/><circle cx="${cx - 18}" cy="${top - 8}" r="3" fill="#1982c4"/><circle cx="${cx + 18}" cy="${top - 8}" r="3" fill="#1982c4"/>`;
    case 'grad-cap':
      return `<polygon points="${cx - 38},${top - 18} ${cx},${top - 34} ${cx + 38},${top - 18} ${cx},${top - 2}" fill="#2b2d42" stroke="#111" stroke-width="1.5"/>
      <rect x="${cx - 16}" y="${top - 8}" width="32" height="10" fill="#2b2d42"/>
      <path d="M${cx + 30} ${top - 20} V${top + 2}" stroke="#f2c94c" stroke-width="2"/><circle cx="${cx + 30}" cy="${top + 4}" r="3" fill="#f2c94c"/>`;
    case 'number-candles': {
      const n = esc((d.digits || '1').slice(0, 2));
      const count = n.length;
      let s = `<text x="${cx}" y="${top + 4}" text-anchor="middle" ${textStyle('#7cc6fe', 46, "'Arial Black',Arial,sans-serif", '900')} stroke="#3a7fc0" stroke-width="1.5">${n}</text>`;
      for (let i = 0; i < count; i++) {
        const x = cx - (count * 26) / 2 + 13 + i * 26;
        s += `<path d="M${x} ${top - 52} q-6 9 0 14 q6 -5 0 -14z" fill="#ffb703" stroke="#fb8500"/>`;
      }
      return s;
    }
    default:
      return '';
  }
}

/** Edible picture panels, drawn from the picture library (no photos). */
function pictureSvg(ctx: Ctx, id: string, x: number, y: number, w: number, h: number): string {
  const g = 'p' + ctx.uid++;
  const frame = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${g})" stroke="#fff" stroke-width="2"/>`;
  const bg = (a: string, b: string) => `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  const cxp = x + w / 2;
  switch (id) {
    case 'unicorn':
      return bg('#fbd3e9', '#f7f0ff') + frame + `<polygon points="${cxp - 5},${y + h * 0.55} ${cxp + 5},${y + h * 0.55} ${cxp},${y + h * 0.15}" fill="#f2c94c"/><circle cx="${cxp}" cy="${y + h * 0.68}" r="${Math.min(w, h) * 0.22}" fill="#fff" stroke="#c8c8c8"/>`;
    case 'dinosaur':
      return bg('#cdeac0', '#f1f9e8') + frame + `<ellipse cx="${cxp}" cy="${y + h * 0.62}" rx="${w * 0.28}" ry="${h * 0.2}" fill="#6cbf5f" stroke="#3d7a35"/><circle cx="${cxp + w * 0.2}" cy="${y + h * 0.4}" r="${h * 0.1}" fill="#6cbf5f" stroke="#3d7a35"/>`;
    case 'football':
      return bg('#b7e4c7', '#e8f8ee') + frame + `<circle cx="${cxp}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.3}" fill="#fff" stroke="#222" stroke-width="1.5"/><polygon points="${cxp},${y + h * 0.4} ${cxp + 6},${y + h * 0.5} ${cxp},${y + h * 0.6} ${cxp - 6},${y + h * 0.5}" fill="#222"/>`;
    case 'rainbow':
      return bg('#d7ecff', '#fff') + frame + [0, 1, 2, 3].map((i) => `<path d="M${x + 6 + i * 4} ${y + h - 6} A${w / 2 - 6 - i * 4} ${w / 2 - 6 - i * 4} 0 0 1 ${x + w - 6 - i * 4} ${y + h - 6}" fill="none" stroke="${RAIN[i]}" stroke-width="4"/>`).join('');
    default:
      return bg('#eef0f4', '#fff') + frame + `<circle cx="${cxp}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.28}" fill="#3a5ba0"/><text x="${cxp}" y="${y + h / 2 + 4}" text-anchor="middle" style="fill:#fff;font:700 11px Arial">LOGO</text>`;
  }
}

function numberSvg(ctx: Ctx, d: Design, col: string): string {
  const digits = (d.digits || '7').slice(0, 2);
  const fs = digits.length > 1 ? 165 : 205;
  const id = 'clip' + ctx.uid++;
  const dark = shade(col, -0.25);
  const t = esc(digits);
  let s = `<defs><clipPath id="${id}"><text x="150" y="212" text-anchor="middle" style="font:900 ${fs}px 'Arial Black','Segoe UI Black',Arial,sans-serif">${t}</text></clipPath></defs>`;
  s += `<g style="filter:drop-shadow(0 3px 0 ${dark})"><text x="150" y="212" text-anchor="middle" ${textStyle(col, fs, "'Arial Black','Segoe UI Black',Arial,sans-serif", '900')}>${t}</text></g>`;
  const light = shade(col, 0.45);
  let g = '';
  let k = 0;
  for (let y = 70; y < 215; y += 22) {
    for (let x = 20; x < 290; x += 22) {
      const xx = x + ((y / 22) % 2 ? 11 : 0);
      const kind = d.decorations.length ? d.decorations[k++ % d.decorations.length] : 'cream';
      if (kind === 'macarons') g += `<ellipse cx="${xx}" cy="${y}" rx="8" ry="4" fill="#f6b3c6"/><ellipse cx="${xx}" cy="${y + 4}" rx="8" ry="4" fill="#d986a3"/><rect x="${xx - 7}" y="${y + 1}" width="14" height="2" fill="#fff"/>`;
      else if (kind === 'fruit') g += `<circle cx="${xx}" cy="${y}" r="6" fill="${k % 3 ? '#d62839' : '#3a5ba0'}"/><circle cx="${xx - 2}" cy="${y - 2}" r="1.5" fill="#fff" opacity=".6"/>`;
      else if (kind === 'fresh flowers') g += flower(xx, y, 5, k % 2 ? '#f28482' : '#cdb4db');
      else g += `<circle cx="${xx}" cy="${y}" r="7" fill="${light}" stroke="${dark}" stroke-width="1"/>`;
    }
  }
  return s + `<g clip-path="url(#${id})">${g}</g>`;
}

function sheetSvg(ctx: Ctx, d: Design, col: string): string {
  const full = d.size === 'full';
  const L = full ? 18 : 40;
  const R = full ? 282 : 260;
  const inset = 26;
  const top = full ? 118 : 126;
  const mid = 168;
  const bot = 206;
  const dark = shade(col, -0.22);
  const light = shade(col, 0.25);
  let s = `<polygon points="${L},${mid} ${R},${mid} ${R},${bot} ${L},${bot}" fill="${dark}" stroke="${shade(col, -0.4)}" stroke-width="1.5"/>`;
  s += `<polygon points="${L + inset},${top} ${R - inset},${top} ${R},${mid} ${L},${mid}" fill="${light}" stroke="${dark}" stroke-width="2"/>`;
  let textX = 150;
  let textW = R - L - 70;
  if (d.picture) {
    const ix = L + inset + 6;
    const iw = 62;
    s += pictureSvg(ctx, d.picture, ix, top + 6, iw, mid - top - 12);
    textX = ix + iw + (R - inset - ix - iw) / 2 + 4;
    textW = R - inset - ix - iw - 10;
  }
  if (d.decorations.includes('sprinkles')) {
    const r = rng(11);
    for (let i = 0; i < 40; i++) {
      const y = top + 4 + r() * (mid - top - 8);
      const f = (y - top) / (mid - top);
      const xl = L + inset * (1 - f);
      const xr = R - inset * (1 - f);
      const x = xl + 6 + r() * (xr - xl - 12);
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="6" height="2.4" rx="1.2" fill="${SPRINKLES[i % 6]}" transform="rotate(${Math.round(r() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
  }
  if (d.decorations.includes('rosettes')) {
    const n = full ? 12 : 10;
    for (let i = 0; i < n; i++) {
      const x = L + 8 + (i * (R - L - 16)) / (n - 1);
      s += `<circle cx="${x.toFixed(1)}" cy="${mid}" r="7" fill="${light}" stroke="${dark}" stroke-width="1.5"/>`;
    }
  }
  if (d.message) {
    const fs = Math.min(17, textW / (d.message.length * 0.64));
    const ink = lum(col) > 0.55 ? '#8a2b4c' : '#ffffff';
    s += `<text x="${textX.toFixed(1)}" y="${((top + mid) / 2 + 6).toFixed(1)}" text-anchor="middle" ${textStyle(ink, fs.toFixed(1))}>${esc(d.message)}</text>`;
  }
  return s;
}

/** A box of cupcakes seen from above. */
function cupcakesSvg(d: Design, col: string): string {
  const count = d.size === 'box24' ? 24 : d.size === 'box12' ? 12 : 6;
  const cols = count === 24 ? 6 : count === 12 ? 4 : 3;
  const rows = count / cols;
  const cell = Math.min(52, 260 / cols, 150 / rows);
  const w = cols * cell;
  const h = rows * cell;
  const x0 = 150 - w / 2;
  const y0 = 128 - h / 2;
  const dark = shade(col, -0.22);
  let s = `<rect x="${x0 - 10}" y="${y0 - 10}" width="${w + 20}" height="${h + 20}" rx="10" fill="#e8d5b5" stroke="#b79b6c" stroke-width="2"/>`;
  const r = rng(5);
  for (let i = 0; i < count; i++) {
    const cx = x0 + (i % cols) * cell + cell / 2;
    const cy = y0 + Math.floor(i / cols) * cell + cell / 2;
    s += `<circle cx="${cx}" cy="${cy}" r="${(cell / 2 - 2).toFixed(1)}" fill="${col}" stroke="${dark}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${(cell / 4).toFixed(1)}" fill="none" stroke="${dark}" opacity=".5"/>`;
    if (d.decorations.includes('sprinkles')) {
      for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2;
        const rr = r() * (cell / 2 - 7);
        s += `<rect x="${(cx + Math.cos(a) * rr).toFixed(1)}" y="${(cy + Math.sin(a) * rr).toFixed(1)}" width="5" height="2" rx="1" fill="${SPRINKLES[(i + k) % 6]}" transform="rotate(${Math.round(r() * 180)} ${cx} ${cy})"/>`;
      }
    } else if (d.decorations.includes('fruit')) s += `<circle cx="${cx}" cy="${cy}" r="${cell / 7}" fill="#d62839"/>`;
    else if (d.decorations.includes('macarons')) s += `<ellipse cx="${cx}" cy="${cy}" rx="${cell / 6}" ry="${cell / 10}" fill="#f6b3c6"/>`;
    else if (d.decorations.includes('fresh flowers')) s += flower(cx, cy, cell / 8, '#f28482');
  }
  return s;
}

function miniSvg(ctx: Ctx, d: Design, col: string): string {
  return tierSvg(ctx, 150, 200, 130, 62, d, col, { topper: false, message: true }, []);
}

export function drawCake(d: Design): string {
  const ctx: Ctx = { uid: 0 };
  const tpl = template(d.template);
  const colHex = COLOURS.find((c) => c.id === d.colour)?.hex ?? COLOURS[0].hex;
  let s = `<ellipse cx="150" cy="226" rx="138" ry="20" fill="#e3e6eb" stroke="#b9bfc9" stroke-width="1.5"/>`;
  if (tpl) {
    const ln = line(tpl.line).id;
    const look = tpl.look ?? [];
    if (ln === 'round') {
      const w = ({ '6in': 150, '8in': 182, '10in': 214 } as Record<string, number>)[d.size] || 182;
      s += tierSvg(ctx, 150, 214, w, 92, d, colHex, { topper: true, message: true }, look);
    } else if (ln === 'tiered') {
      if (d.size.startsWith('3')) {
        const big = d.size === '3t120';
        s += tierSvg(ctx, 150, 214, big ? 236 : 214, 56, d, colHex, { topper: false, message: true }, look);
        s += tierSvg(ctx, 150, 158, big ? 176 : 156, 48, d, colHex, { topper: false, message: false }, look);
        s += tierSvg(ctx, 150, 110, big ? 120 : 104, 42, d, colHex, { topper: true, message: false }, look);
      } else {
        const big = d.size === '2t50';
        s += tierSvg(ctx, 150, 214, big ? 228 : 206, 80, d, colHex, { topper: false, message: true }, look);
        s += tierSvg(ctx, 150, 134, big ? 154 : 136, 64, d, colHex, { topper: true, message: false }, look);
      }
    } else if (ln === 'number') s += numberSvg(ctx, d, colHex);
    else if (ln === 'sheet') s += sheetSvg(ctx, d, colHex);
    else if (ln === 'cupcakes') s += cupcakesSvg(d, colHex);
    else if (ln === 'mini') s += miniSvg(ctx, d, colHex);
  }
  return `<svg class="cake" viewBox="0 0 300 250" role="img" aria-label="Preview of the cake">${s}</svg>`;
}
