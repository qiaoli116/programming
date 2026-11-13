/* Cake Order Desk: the Preview agent's drawing code (layers drawn by rules from a design).
   Copied from ordering-design.html so the app mockup shows exactly the same pictures. */
const COLOURS = { white:'#fbf8f2', pink:'#f6b3c6', purple:'#b79be8', blue:'#9fcbf2', yellow:'#f6df86', mint:'#a6e2c6', chocolate:'#7a4b32', black:'#3a3a3a' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ===================== Preview agent: draws the cake from the design ===================== */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255];
  return '#' + ch.map(v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt).toString(16).padStart(2, '0')).join('');
}
function lum(hex) { const n = parseInt(hex.slice(1),16); return (0.299*(n>>16) + 0.587*((n>>8)&255) + 0.114*(n&255)) / 255; }
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
let uid = 0;
const RAIN = ['#ff595e','#ff924c','#ffca3a','#8ac926','#1982c4','#6a4c93'];
function flower(x, y, r, c) {
  let s = '';
  for (let i = 0; i < 5; i++) { const a = i * 2 * Math.PI / 5 - Math.PI/2; s += `<circle cx="${(x + Math.cos(a)*r).toFixed(1)}" cy="${(y + Math.sin(a)*r).toFixed(1)}" r="${(r*0.75).toFixed(1)}" fill="${c}"/>`; }
  return s + `<circle cx="${x}" cy="${y}" r="${(r*0.55).toFixed(1)}" fill="#ffd166"/>`;
}
function textStyle(fill, size, family, weight) { return `style="fill:${fill};font:${weight||'italic 700'} ${size}px ${family||"'Segoe Script','Brush Script MT',cursive"}"`; }

function tierSvg(cx, bottom, w, h, d, col, opt) {
  const rx = w/2, ry = Math.round(w*0.11), top = bottom - h, L = cx - rx, R = cx + rx;
  const dark = shade(col, -.22), light = shade(col, .3), decs = d.decorations || [];
  const fy = x => top + ry * Math.sqrt(Math.max(0, 1 - ((x - cx)/rx) ** 2));
  const fb = x => bottom + ry * Math.sqrt(Math.max(0, 1 - ((x - cx)/rx) ** 2));
  let s = `<path d="M${L} ${top} V${bottom} A${rx} ${ry} 0 0 0 ${R} ${bottom} V${top} Z" fill="${col}" stroke="${dark}" stroke-width="2"/>`;
  if (d.finish === 'fondant') s += `<path d="M${L+12} ${top+ry+6} V${bottom-4}" stroke="${light}" stroke-width="7" stroke-linecap="round" opacity=".9"/>`;
  if (decs.includes('sprinkles')) {
    const r = rng(7 + w), cs = ['#e63946','#f4a261','#2a9d8f','#457b9d','#ffd166','#c77dff'];
    for (let i = 0; i < 34; i++) { const x = L + 10 + r()*(w-20), y = fy(x) + 12 + r()*(h - 16); s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="7" height="2.6" rx="1.3" fill="${cs[i%6]}" transform="rotate(${Math.round(r()*180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }
  }
  if (decs.includes('ribbon')) s += `<path d="M${L} ${bottom-20} A${rx} ${ry} 0 0 0 ${R} ${bottom-20} V${bottom-8} A${rx} ${ry} 0 0 1 ${L} ${bottom-8} Z" fill="#c9a227" stroke="#a07f17" stroke-width="1"/>`;
  const drip = decs.includes('rainbow drip') ? 'rain' : decs.includes('chocolate drip') ? 'choc' : null;
  s += `<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="${drip==='choc' ? '#5a3522' : light}" stroke="${drip==='choc' ? '#3d2416' : dark}" stroke-width="2"/>`;
  if (drip) {
    const n = Math.max(6, Math.round(w/17));
    for (let i = 0; i < n; i++) {
      const x = L + 7 + i*(w - 14)/(n - 1), len = 10 + ((i*5) % 4) * 6;
      s += `<rect x="${(x-5).toFixed(1)}" y="${(fy(x)-6).toFixed(1)}" width="10" height="${len+6}" rx="5" fill="${drip==='choc' ? '#5a3522' : RAIN[i%6]}"/>`;
    }
    if (drip === 'rain') { const g = 'g' + (uid++); s += `<defs><linearGradient id="${g}"><stop offset="0" stop-color="${RAIN[0]}"/><stop offset=".2" stop-color="${RAIN[1]}"/><stop offset=".4" stop-color="${RAIN[2]}"/><stop offset=".6" stop-color="${RAIN[3]}"/><stop offset=".8" stop-color="${RAIN[4]}"/><stop offset="1" stop-color="${RAIN[5]}"/></linearGradient></defs><path d="M${L} ${top} A${rx} ${ry} 0 0 0 ${R} ${top} V${top+6} A${rx} ${ry} 0 0 1 ${L} ${top+6} Z" fill="url(#${g})"/>`; }
    else s += `<path d="M${L} ${top} A${rx} ${ry} 0 0 0 ${R} ${top} V${top+6} A${rx} ${ry} 0 0 1 ${L} ${top+6} Z" fill="#5a3522"/>`;
  }
  if (decs.includes('rosettes')) {
    const n = Math.round(w/20);
    for (let i = 0; i < n; i++) { const x = L + 8 + i*(w-16)/(n-1); s += `<circle cx="${x.toFixed(1)}" cy="${fy(x).toFixed(1)}" r="8" fill="${light}" stroke="${dark}" stroke-width="1.5"/><circle cx="${x.toFixed(1)}" cy="${fy(x).toFixed(1)}" r="3" fill="none" stroke="${dark}"/>`; }
    for (let i = 0; i < n; i++) { const x = L + 8 + i*(w-16)/(n-1); s += `<circle cx="${x.toFixed(1)}" cy="${(fb(x)-4).toFixed(1)}" r="7" fill="${light}" stroke="${dark}" stroke-width="1.5"/>`; }
  }
  if (opt.inscription && d.inscription) {
    const fs = Math.min(18, (w - 30) / (d.inscription.length * 0.64)), ink = lum(col) > 0.55 ? '#8a2b4c' : '#ffffff';
    s += `<text x="${cx}" y="${(opt.topper ? top + ry + (h - ry) * 0.62 : bottom + ry - 25).toFixed(1)}" text-anchor="middle" ${textStyle(ink, fs.toFixed(1))}>${esc(d.inscription)}</text>`;
  }
  if (opt.topper && decs.includes('fresh flowers')) {
    s += flower(cx - rx*0.55, top + 2, 8, '#f28482') + flower(cx - rx*0.32, top + ry*0.7, 7, '#e5989b') + flower(cx + rx*0.5, top + ry*0.4, 8, '#f6bd60');
  }
  if (opt.topper) s += topperSvg(d, cx, top, rx);
  return s;
}

function topperSvg(d, cx, top, rx) {
  switch (d.topper) {
    case 'unicorn': return `
      <polygon points="${cx-44},${top+2} ${cx-24},${top} ${cx-38},${top-28}" fill="#fff" stroke="#c8c8c8" stroke-width="1.5"/>
      <polygon points="${cx-39},${top-2} ${cx-29},${top-2} ${cx-36},${top-17}" fill="#f6b3c6"/>
      <polygon points="${cx+44},${top+2} ${cx+24},${top} ${cx+38},${top-28}" fill="#fff" stroke="#c8c8c8" stroke-width="1.5"/>
      <polygon points="${cx+39},${top-2} ${cx+29},${top-2} ${cx+36},${top-17}" fill="#f6b3c6"/>
      <polygon points="${cx-12},${top+3} ${cx+12},${top+3} ${cx},${top-70}" fill="#f2c94c" stroke="#b8860b" stroke-width="1.5"/>
      <path d="M${cx-9} ${top-8} L${cx+10} ${top-16} M${cx-7} ${top-24} L${cx+8} ${top-31} M${cx-5} ${top-40} L${cx+5} ${top-45}" stroke="#b8860b" stroke-width="1.5"/>`;
    case 'dinosaur': return `<g transform="translate(${cx-40} ${top-58})">
      <path d="M10 46 Q14 22 40 22 Q58 22 62 8 Q64 0 74 2 Q82 4 78 12 L70 16 Q68 40 50 46 Z" fill="#6cbf5f" stroke="#3d7a35" stroke-width="1.5"/>
      <path d="M24 24 l4 -9 l4 8 M34 22 l4 -9 l4 8 M44 22 l4 -8 l3 8" fill="#3d7a35"/>
      <rect x="20" y="42" width="8" height="14" fill="#6cbf5f" stroke="#3d7a35"/><rect x="44" y="42" width="8" height="14" fill="#6cbf5f" stroke="#3d7a35"/>
      <circle cx="73" cy="7" r="1.8" fill="#1d2330"/><path d="M10 46 Q0 50 -6 42" stroke="#3d7a35" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
    case 'football': return `<line x1="${cx}" y1="${top}" x2="${cx}" y2="${top-14}" stroke="#888" stroke-width="2"/>
      <circle cx="${cx}" cy="${top-36}" r="23" fill="#fff" stroke="#222" stroke-width="2"/>
      <polygon points="${cx},${top-46} ${cx+9},${top-39} ${cx+6},${top-28} ${cx-6},${top-28} ${cx-9},${top-39}" fill="#222"/>`;
    case 'crown': return `<polygon points="${cx-30},${top+2} ${cx-34},${top-34} ${cx-17},${top-16} ${cx},${top-42} ${cx+17},${top-16} ${cx+34},${top-34} ${cx+30},${top+2}" fill="#f2c94c" stroke="#b8860b" stroke-width="2"/>
      <circle cx="${cx}" cy="${top-12}" r="4" fill="#e63946"/><circle cx="${cx-18}" cy="${top-8}" r="3" fill="#1982c4"/><circle cx="${cx+18}" cy="${top-8}" r="3" fill="#1982c4"/>`;
    case 'number candles': {
      const n = (d.number || '1'), w = n.length * 26;
      let s = `<text x="${cx}" y="${top+4}" text-anchor="middle" ${textStyle('#7cc6fe', 46, "'Arial Black',Arial,sans-serif", '900')} stroke="#3a7fc0" stroke-width="1.5">${esc(n)}</text>`;
      for (let i = 0; i < n.length; i++) { const x = cx - w/2 + 13 + i*26; s += `<path d="M${x} ${top-52} q-6 9 0 14 q6 -5 0 -14z" fill="#ffb703" stroke="#fb8500"/>`; }
      return s;
    }
    default: return '';
  }
}

function numberSvg(d, col) {
  const digits = (d.digits || '7').slice(0, 2), fs = digits.length > 1 ? 165 : 205, id = 'clip' + (uid++), dark = shade(col, -.25);
  const txt = `<text x="150" y="212" text-anchor="middle" ${textStyle(col, fs, "'Arial Black','Segoe UI Black',Arial,sans-serif", '900')}>${esc(digits)}</text>`;
  let s = `<defs><clipPath id="${id}"><text x="150" y="212" text-anchor="middle" style="font:900 ${fs}px 'Arial Black','Segoe UI Black',Arial,sans-serif">${esc(digits)}</text></clipPath></defs>`;
  s += `<g style="filter:drop-shadow(0 3px 0 ${dark})">${txt}</g>`;
  const decs = d.decorations || [], light = shade(col, .45);
  let g = '';
  let k = 0;
  for (let y = 70; y < 215; y += 22) for (let x = 20; x < 290; x += 22) {
    const xx = x + ((y/22) % 2 ? 11 : 0), kind = decs.length ? decs[(k++) % decs.length] : 'cream';
    if (kind === 'macarons') g += `<ellipse cx="${xx}" cy="${y}" rx="8" ry="4" fill="#f6b3c6"/><ellipse cx="${xx}" cy="${y+4}" rx="8" ry="4" fill="#d986a3"/><rect x="${xx-7}" y="${y+1}" width="14" height="2" fill="#fff"/>`;
    else if (kind === 'fruit') g += `<circle cx="${xx}" cy="${y}" r="6" fill="${(k%3) ? '#d62839' : '#3a5ba0'}"/><circle cx="${xx-2}" cy="${y-2}" r="1.5" fill="#fff" opacity=".6"/>`;
    else if (kind === 'fresh flowers') g += flower(xx, y, 5, (k%2) ? '#f28482' : '#cdb4db');
    else g += `<circle cx="${xx}" cy="${y}" r="7" fill="${light}" stroke="${dark}" stroke-width="1"/>`;
  }
  return s + `<g clip-path="url(#${id})">${g}</g>`;
}

function sheetSvg(d, col) {
  const full = d.size === 'full', L = full ? 18 : 40, R = full ? 282 : 260, inset = 26, top = full ? 118 : 126, mid = 168, bot = 206;
  const dark = shade(col, -.22), light = shade(col, .25), decs = d.decorations || [];
  let s = `<polygon points="${L},${mid} ${R},${mid} ${R},${bot} ${L},${bot}" fill="${dark}" stroke="${shade(col,-.4)}" stroke-width="1.5"/>`;
  s += `<polygon points="${L+inset},${top} ${R-inset},${top} ${R},${mid} ${L},${mid}" fill="${light}" stroke="${dark}" stroke-width="2"/>`;
  let textX = 150, textW = R - L - 70;
  if (decs.includes('edible image')) {
    const ix = L + inset + 6, iw = 62, iy = top + 6, ih = mid - top - 12, g = 'sky' + (uid++);
    s += `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ecae6"/><stop offset="1" stop-color="#e0f4ff"/></linearGradient></defs>
      <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#${g})" stroke="#fff" stroke-width="2"/>
      <circle cx="${ix+46}" cy="${iy+10}" r="6" fill="#ffb703"/><polygon points="${ix},${iy+ih} ${ix+22},${iy+12} ${ix+40},${iy+ih}" fill="#52796f"/><polygon points="${ix+24},${iy+ih} ${ix+44},${iy+18} ${ix+62},${iy+ih}" fill="#84a98c"/>`;
    textX = ix + iw + (R - inset - ix - iw) / 2 + 4; textW = R - inset - ix - iw - 10;
  }
  if (decs.includes('sprinkles')) {
    const r = rng(11), cs = ['#e63946','#f4a261','#2a9d8f','#457b9d','#ffd166','#c77dff'];
    for (let i = 0; i < 40; i++) { const y = top + 4 + r()*(mid - top - 8), f = (y - top)/(mid - top), xl = L + inset*(1-f), xr = R - inset*(1-f), x = xl + 6 + r()*(xr - xl - 12); s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="6" height="2.4" rx="1.2" fill="${cs[i%6]}" transform="rotate(${Math.round(r()*180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }
  }
  if (decs.includes('rosettes')) {
    const n = full ? 12 : 10;
    for (let i = 0; i < n; i++) { const x = L + 8 + i*(R - L - 16)/(n-1); s += `<circle cx="${x.toFixed(1)}" cy="${mid}" r="7" fill="${light}" stroke="${dark}" stroke-width="1.5"/>`; }
  }
  if (d.inscription) {
    const fs = Math.min(17, textW / (d.inscription.length * 0.64)), ink = lum(col) > 0.55 ? '#8a2b4c' : '#ffffff';
    s += `<text x="${textX.toFixed(1)}" y="${((top + mid)/2 + 6).toFixed(1)}" text-anchor="middle" ${textStyle(ink, fs.toFixed(1))}>${esc(d.inscription)}</text>`;
  }
  return s;
}

function drawCake(d) {
  const col = COLOURS[d.colour] || COLOURS.white;
  let s = `<ellipse cx="150" cy="226" rx="138" ry="20" fill="#e3e6eb" stroke="#b9bfc9" stroke-width="1.5"/>`;
  if (d.template === 'classic') { const w = { '6in':150, '8in':182, '10in':214 }[d.size] || 182; s += tierSvg(150, 214, w, 92, d, col, { topper:true, inscription:true }); }
  else if (d.template === 'tier') { const big = d.size === '50'; s += tierSvg(150, 214, big ? 228 : 206, 80, d, col, { topper:false, inscription:true }) + tierSvg(150, 134, big ? 154 : 136, 64, d, col, { topper:true, inscription:false }); }
  else if (d.template === 'number') s += numberSvg(d, col);
  else if (d.template === 'sheet') s += sheetSvg(d, col);
  return `<svg class="cake" viewBox="0 0 300 250" role="img" aria-label="Preview of the cake">${s}</svg>`;
}
