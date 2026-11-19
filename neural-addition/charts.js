/*
 * charts.js — the small charts around the network:
 *   LineChart      learning curves (loss; train vs unseen accuracy) with a hover crosshair
 *   CoverageStrip  one cell per value (A 0-100, B 0-100, C 0-200), brighter = more training examples
 *   EquationMap    101 x 101 grid of every A + B; training cells vs unseen cells right/wrong
 */
(function (root) {
  'use strict';
  const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
  const INK = { primary: '#ece6f5', secondary: '#a596bd', muted: '#6f6185', grid: 'rgba(160,140,200,0.12)', axis: 'rgba(160,140,200,0.28)' };

  // ---------- shared tooltip ----------
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  document.body.appendChild(tip);
  function showTip(html, clientX, clientY) {
    tip.innerHTML = html;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    let x = clientX + 14, y = clientY - r.height - 10;
    if (x + r.width > window.innerWidth - 8) x = clientX - r.width - 14;
    if (y < 8) y = clientY + 16;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  function setup(canvas) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, W: r.width, H: r.height };
  }

  // ---------- line chart ----------
  class LineChart {
    /** series: [{key, name, color}], opts: {yMax, yFormat, xMax, logY} */
    constructor(canvas, series, opts) {
      this.canvas = canvas; this.series = series; this.opts = opts;
      this.points = []; // [{x, key: value...}]
      this.hover = null;
      canvas.addEventListener('mousemove', e => this.onMove(e));
      canvas.addEventListener('mouseleave', () => { this.hover = null; hideTip(); this.draw(); });
    }
    setData(points) { this.points = points; this.draw(); }

    geom() {
      const { W, H } = this;
      return { left: 36, right: W - 34, top: 10, bottom: H - 20 };
    }
    yMaxNow() {
      if (this.opts.yMax) return this.opts.yMax;
      let m = 0;
      for (const p of this.points) for (const s of this.series) if (p[s.key] != null) m = Math.max(m, p[s.key]);
      return m > 0 ? niceCeil(m) : 1;
    }
    sx(x) { const gm = this.geom(); const xMax = Math.max(this.opts.xMax, this.points.length ? this.points[this.points.length - 1].x : 0); return gm.left + (gm.right - gm.left) * (x / xMax); }
    sy(v) { const gm = this.geom(); return gm.bottom - (gm.bottom - gm.top) * (v / this.yMaxNow()); }

    draw() {
      const s = setup(this.canvas);
      const g = s.g; this.W = s.W; this.H = s.H;
      const gm = this.geom(), yMax = this.yMaxNow();
      const xMax = Math.max(this.opts.xMax, this.points.length ? this.points[this.points.length - 1].x : 0);
      // grid + y labels
      g.font = `10px ${FONT}`;
      g.textBaseline = 'middle';
      g.textAlign = 'right';
      for (let k = 0; k <= 4; k++) {
        const v = yMax * k / 4, y = this.sy(v);
        g.strokeStyle = k === 0 ? INK.axis : INK.grid;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(gm.left, Math.round(y) + 0.5); g.lineTo(gm.right, Math.round(y) + 0.5); g.stroke();
        if (k % 2 === 0) { g.fillStyle = INK.muted; g.fillText(this.opts.yFormat(v), gm.left - 6, y); }
      }
      // x labels
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = INK.muted;
      const step = xMax <= 60 ? 20 : niceCeil(xMax / 3);
      for (let x = 0; x <= xMax; x += step) {
        const lastTick = x + step > xMax;
        g.textAlign = lastTick ? 'right' : 'center';
        g.fillText(lastTick ? `${x} epochs` : String(x), lastTick ? this.sx(x) + 4 : this.sx(x), gm.bottom + 5);
      }
      if (!this.points.length) {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = INK.muted;
        g.fillText('starts when training starts', (gm.left + gm.right) / 2, (gm.top + gm.bottom) / 2);
        return;
      }
      // lines
      for (const s of this.series) {
        g.strokeStyle = s.color;
        g.lineWidth = 2;
        g.lineJoin = 'round';
        g.beginPath();
        let started = false;
        for (const p of this.points) {
          if (p[s.key] == null) continue;
          const x = this.sx(p.x), y = this.sy(p[s.key]);
          if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
        }
        g.stroke();
      }
      // direct labels at line ends (text in ink, colour carried by a short key line)
      if (this.series.length > 1) {
        const last = this.points[this.points.length - 1];
        const ends = this.series.filter(s => last[s.key] != null).map(s => ({ s, y: this.sy(last[s.key]) }));
        ends.sort((a, b) => a.y - b.y);
        for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 11) ends[k].y = ends[k - 1].y + 11;
        g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `600 10px ${FONT}`;
        for (const e of ends) {
          g.fillStyle = INK.primary;
          g.fillText(this.opts.yFormat(last[e.s.key]), gm.right + 4, e.y);
        }
      }
      // hover crosshair
      if (this.hover != null) {
        const p = this.points[this.hover], x = this.sx(p.x);
        g.strokeStyle = 'rgba(220,210,245,0.35)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(Math.round(x) + 0.5, gm.top); g.lineTo(Math.round(x) + 0.5, gm.bottom); g.stroke();
        for (const s of this.series) {
          if (p[s.key] == null) continue;
          g.beginPath();
          g.arc(x, this.sy(p[s.key]), 4, 0, Math.PI * 2);
          g.fillStyle = s.color; g.fill();
          g.lineWidth = 2; g.strokeStyle = '#140b1f'; g.stroke();
        }
      }
    }

    onMove(e) {
      if (!this.points.length) return;
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      let best = 0, bd = Infinity;
      this.points.forEach((p, k) => { const d = Math.abs(this.sx(p.x) - mx); if (d < bd) { bd = d; best = k; } });
      this.hover = best;
      this.draw();
      const p = this.points[best];
      const rows = this.series.filter(s => p[s.key] != null).map(s =>
        `<div class="tip-row"><span class="tip-key" style="background:${s.color}"></span>${s.name}<b>${this.opts.yFormat(p[s.key])}</b></div>`).join('');
      showTip(`<div class="tip-title">Epoch ${p.x}</div>${rows}`, e.clientX, e.clientY);
    }
  }

  function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  // ---------- coverage strip ----------
  class CoverageStrip {
    constructor(canvas, name) {
      this.canvas = canvas; this.name = name; this.counts = null;
      canvas.addEventListener('mousemove', e => this.onMove(e));
      canvas.addEventListener('mouseleave', hideTip);
    }
    setCounts(counts) { this.counts = counts; this.draw(); }
    draw() {
      const { g, W, H } = setup(this.canvas);
      this.W = W;
      const c = this.counts; if (!c) return;
      const n = c.length, cw = W / n;
      let max = 1;
      for (const v of c) max = Math.max(max, v);
      for (let k = 0; k < n; k++) {
        const t = c[k] / max;
        // sequential: one hue, dark (few) -> light (many)
        const L = c[k] === 0 ? 0 : 0.25 + 0.75 * Math.sqrt(t);
        g.fillStyle = c[k] === 0 ? '#2a0f18' : `rgb(${Math.round(42 + (206 - 42) * L)},${Math.round(26 + (170 - 26) * L)},${Math.round(64 + (255 - 64) * L)})`;
        g.fillRect(k * cw, 0, Math.ceil(cw), H);
      }
    }
    onMove(e) {
      if (!this.counts) return;
      const r = this.canvas.getBoundingClientRect();
      const k = Math.max(0, Math.min(this.counts.length - 1, Math.floor((e.clientX - r.left) / r.width * this.counts.length)));
      showTip(`<div class="tip-title">${this.name} = ${k}</div><div class="tip-row">training equations<b>${this.counts[k]}</b></div>`, e.clientX, e.clientY);
    }
  }

  // ---------- equation map ----------
  const MAP_COLORS = { train: '#9b6bf2', ok: '#1aa595', wrong: '#ff5c7a', untested: '#2b2140' };
  class EquationMap {
    constructor(canvas, onPick) {
      this.canvas = canvas; this.onPick = onPick;
      this.isTrain = null; this.pred = null; this.selected = null;
      canvas.addEventListener('mousemove', e => this.onMove(e));
      canvas.addEventListener('mouseleave', () => { hideTip(); });
      canvas.addEventListener('click', e => { const c = this.cellAt(e); if (c) this.onPick(c.a, c.b); });
    }
    set(isTrain, pred) { this.isTrain = isTrain; this.pred = pred; this.draw(); }
    select(a, b) { this.selected = [a, b]; this.draw(); }
    draw() {
      const { g, W, H } = setup(this.canvas);
      this.W = W; this.H = H;
      const N = 101, cs = Math.min(W, H) / N;
      this.cs = cs;
      g.fillStyle = '#0d0716';
      g.fillRect(0, 0, W, H);
      if (!this.isTrain) return;
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
        const k = a * N + b;
        let col;
        if (this.isTrain[k]) col = MAP_COLORS.train;
        else if (!this.pred) col = MAP_COLORS.untested;
        else col = this.pred[k] === a + b ? MAP_COLORS.ok : MAP_COLORS.wrong;
        g.fillStyle = col;
        g.globalAlpha = this.isTrain[k] ? 0.95 : (this.pred && this.pred[k] !== a + b ? 1 : 0.55);
        g.fillRect(b * cs, a * cs, Math.ceil(cs), Math.ceil(cs));
      }
      g.globalAlpha = 1;
      if (this.selected) {
        const [a, b] = this.selected;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5;
        g.strokeRect(b * cs - 2.5, a * cs - 2.5, cs + 5, cs + 5);
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, a * cs + cs / 2); g.lineTo(W, a * cs + cs / 2);
        g.moveTo(b * cs + cs / 2, 0); g.lineTo(b * cs + cs / 2, H);
        g.stroke();
      }
    }
    cellAt(e) {
      const r = this.canvas.getBoundingClientRect();
      const b = Math.floor((e.clientX - r.left) / this.cs), a = Math.floor((e.clientY - r.top) / this.cs);
      if (a < 0 || b < 0 || a > 100 || b > 100) return null;
      return { a, b };
    }
    onMove(e) {
      const c = this.cellAt(e);
      if (!c || !this.isTrain) { hideTip(); return; }
      const k = c.a * 101 + c.b, seen = this.isTrain[k];
      let line = '';
      if (this.pred) {
        const ok = this.pred[k] === c.a + c.b;
        line = `<div class="tip-row">model says<b>${this.pred[k]} ${ok ? '✓' : '✗'}</b></div>`;
      }
      showTip(`<div class="tip-title">${c.a} + ${c.b} = ${c.a + c.b}</div>` +
        `<div class="tip-row"><span class="tip-key" style="background:${seen ? MAP_COLORS.train : MAP_COLORS.ok}"></span>${seen ? 'in training set' : 'never seen (test)'}</div>${line}` +
        `<div class="tip-hint">click to test it</div>`, e.clientX, e.clientY);
    }
  }

  root.Charts = { LineChart, CoverageStrip, EquationMap, MAP_COLORS, hideTip };
})(window);
