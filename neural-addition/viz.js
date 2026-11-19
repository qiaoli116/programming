/*
 * viz.js — draws the network on a canvas and animates signals flowing through it.
 *
 *   forward pass  : layer by layer the nodes light up (violet glow) while bright
 *                   dots travel along the strongest connections to the next layer
 *   backward pass : (training samples only) a pink wave travels back from the
 *                   output, lighting each node by how much blame it gets
 *
 * Connections are drawn faintly, brighter for larger weights. They are cached
 * on an offscreen canvas and redrawn only when the weights change.
 */
(function (root) {
  'use strict';
  const NN = root.NN;
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function glowSprite(rgb, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, `rgba(${rgb},0.95)`);
    grd.addColorStop(0.22, `rgba(${rgb},0.42)`);
    grd.addColorStop(0.55, `rgba(${rgb},0.10)`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

  class NetworkViz {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cache = document.createElement('canvas');
      this.glow = glowSprite('186,140,255', 128);
      this.glowPink = glowSprite('255,92,170', 128);
      this.glowDot = glowSprite('240,230,255', 48);
      this.glowDotPink = glowSprite('255,140,200', 48);
      this.anim = null;
      this.caption = '';
      this.subcaption = '';
      this.shown = null;       // {a, b, digits, value, truth} currently displayed
      this.showOutput = false;
      this.lastNow = 0;
      this.trails = [];        // fading highlighted connections from finished hops
    }

    setNetwork(net) {
      this.net = net;
      const s = net.sizes;
      this.level = s.map(n => new Float32Array(n));   // displayed brightness 0..1
      this.target = s.map(n => new Float32Array(n));
      this.grad = s.map(n => new Float32Array(n));    // backprop flash 0..1
      this.layerGlow = new Float32Array(s.length);
      this.layerGlowPink = new Float32Array(s.length);
      this.anim = null;
      this.trails = [];
      this.shown = null;
      this.showOutput = false;
      this.outProbs = null;
      this.resize();
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.W = Math.max(300, r.width);
      this.H = Math.max(300, r.height);
      for (const c of [this.canvas, this.cache]) {
        c.width = Math.round(this.W * dpr);
        c.height = Math.round(this.H * dpr);
      }
      if (this.net) this.layout();
      this.weightsDirty = true;
    }

    markWeightsDirty() { this.weightsDirty = true; }

    // ---------------- layout ----------------
    layout() {
      const s = this.net.sizes, L = s.length;
      const compact = this.W < 820;
      this.padL = compact ? 120 : 190;
      this.padR = compact ? 170 : 250;
      this.top = 70; this.bottom = 58;
      const x0 = this.padL, x1 = this.W - this.padR;
      this.xs = s.map((_, l) => lerp(x0, x1, l / (L - 1)));
      const availH = this.H - this.top - this.bottom;
      this.pos = [];       // pos[l][i] = y
      this.radius = [];
      this.groups = [];    // groups[l] = [{label, y, start, size}]
      for (let l = 0; l < L; l++) {
        let groups;
        if (l === 0) groups = NN.INPUT_GROUPS.map(g => ({ label: g.label, size: g.size, operand: g.operand }));
        else if (l === L - 1) groups = NN.OUTPUT_HEADS.map(h => ({ label: h.label, size: h.size }));
        else groups = [{ label: null, size: s[l] }];
        const labelled = groups[0].label != null;
        const GAP = labelled ? 1.55 : 0;
        const slots = groups.reduce((t, g) => t + g.size + GAP, 0);
        const spacing = Math.min(labelled ? 30 : 26, availH / slots);
        let y = this.top + (availH - spacing * slots) / 2;
        const ys = [];
        const gl = [];
        for (const g of groups) {
          const labelY = y + spacing * GAP * 0.62;
          y += spacing * GAP;
          gl.push({ label: g.label, y: labelY, start: ys.length, size: g.size, operand: g.operand });
          for (let k = 0; k < g.size; k++) { ys.push(y + spacing / 2); y += spacing; }
        }
        this.pos.push(ys);
        this.groups.push(gl);
        this.radius.push(clamp(spacing * 0.34, 2.6, 9));
        if (l === 0) this.inSpacing = spacing;
        if (l === L - 1) this.outSpacing = spacing;
      }
    }

    // ---------------- static layer (background + connections) ----------------
    renderCache() {
      const g = this.cache.getContext('2d');
      const { W, H } = this;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#0a0510';
      g.fillRect(0, 0, W, H);
      let grd = g.createRadialGradient(W * 0.48, H * 0.42, 0, W * 0.48, H * 0.42, Math.max(W, H) * 0.75);
      grd.addColorStop(0, 'rgba(70,28,110,0.55)');
      grd.addColorStop(0.45, 'rgba(38,14,62,0.35)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      grd = g.createLinearGradient(0, H * 0.6, 0, H);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      const net = this.net, BUCKETS = 7;
      for (let l = 0; l < net.L; l++) {
        const nin = net.sizes[l], nout = net.sizes[l + 1], Wt = net.W[l];
        let maxAbs = 1e-6;
        for (let k = 0; k < Wt.length; k++) maxAbs = Math.max(maxAbs, Math.abs(Wt[k]));
        const pos = [], neg = [];
        for (let b = 0; b < BUCKETS; b++) { pos.push(new Path2D()); neg.push(new Path2D()); }
        const xa = this.xs[l], xb = this.xs[l + 1], ya = this.pos[l], yb = this.pos[l + 1];
        const ra = this.radius[l], rb = this.radius[l + 1];
        for (let j = 0; j < nout; j++) {
          for (let i = 0; i < nin; i++) {
            const w = Wt[j * nin + i];
            const n = Math.abs(w) / maxAbs;
            if (n < 0.05) continue;
            const b = Math.min(BUCKETS - 1, Math.floor(n * BUCKETS));
            const p = w >= 0 ? pos[b] : neg[b];
            p.moveTo(xa + ra, ya[i]);
            p.lineTo(xb - rb, yb[j]);
          }
        }
        for (let b = 0; b < BUCKETS; b++) {
          const t = (b + 1) / BUCKETS;
          const alpha = 0.025 + 0.26 * Math.pow(t, 1.8);
          g.lineWidth = 0.6 + 0.7 * t;
          g.strokeStyle = `rgba(178,132,255,${alpha})`;
          g.stroke(pos[b]);
          g.strokeStyle = `rgba(104,112,230,${alpha * 0.85})`;
          g.stroke(neg[b]);
        }
      }
      this.weightsDirty = false;
    }

    // ---------------- animation control ----------------
    /**
     * Play a forward (and for mode 'train', backward) pass.
     * trace: {a, b, acts[], deltas[]?, digits}
     */
    play(trace, mode, callbacks) {
      const net = this.net, L = net.L;
      const k = mode === 'test' ? 1 : (mode === 'fast' ? 0.32 : 0.5);
      const anim = {
        trace, mode, cb: callbacks || {}, start: null,
        inDur: 420 * k, hop: 640 * k, backPause: 240 * k, backHop: 520 * k,
        hold: mode === 'test' ? 400 : 120 * k,
        reached: -1, backReached: L + 1, outputShown: false,
        fwd: [], bwd: [],
      };
      for (let l = 0; l < L; l++) {
        anim.fwd.push(this.topConnections(trace, l, 'fwd', mode === 'test' ? 70 : 45));
        if (trace.deltas) anim.bwd.push(this.topConnections(trace, l, 'bwd', 40));
      }
      anim.fEnd = anim.inDur + L * anim.hop;
      anim.bStart = anim.fEnd + anim.backPause;
      anim.bEnd = trace.deltas && mode !== 'test' ? anim.bStart + L * anim.backHop : anim.fEnd;
      anim.end = anim.bEnd + anim.hold;
      for (const t of this.target) t.fill(0);
      this.shown = { a: trace.a, b: trace.b, digits: trace.digits, value: trace.digits[0] * 100 + trace.digits[1] * 10 + trace.digits[2], truth: trace.a + trace.b };
      this.showOutput = false;
      this.outProbs = null;
      this.anim = anim;
    }

    isPlaying() { return !!this.anim; }

    topConnections(trace, l, dir, K) {
      const net = this.net, nin = net.sizes[l], nout = net.sizes[l + 1], Wt = net.W[l];
      const ain = trace.acts[l], aout = trace.acts[l + 1];
      const last = l === net.L - 1;
      const cand = [];
      for (let i = 0; i < nin; i++) {
        if (ain[i] <= 0) continue;
        for (let j = 0; j < nout; j++) {
          const w = Wt[j * nin + i];
          let score;
          if (dir === 'fwd') {
            score = ain[i] * w;
            if (score <= 0) continue;
            if (last) score *= 0.25 + aout[j]; // favour links into likely digits
            else if (aout[j] <= 0) continue;
          } else {
            score = Math.abs(w * trace.deltas[l + 1][j]);
          }
          cand.push({ i, j, score });
        }
      }
      cand.sort((p, q) => q.score - p.score);
      const top = cand.slice(0, K);
      const max = top.length ? top[0].score : 1;
      return top.map(c => ({
        i: c.i, j: c.j,
        s: clamp(c.score / max, 0.15, 1),
        off: Math.random() * 0.4,
      }));
    }

    update(now) {
      const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0.016;
      this.lastNow = now;
      const anim = this.anim, net = this.net, L = net.L;
      if (anim) {
        if (anim.start === null) anim.start = now;
        const t = now - anim.start;
        const reachAt = l => (l === 0 ? anim.inDur * 0.35 : anim.inDur + l * anim.hop);
        while (anim.reached < L && t >= reachAt(anim.reached + 1)) {
          const l = ++anim.reached;
          this.lightLayer(l, anim.trace.acts[l]);
          this.layerGlow[l] = 1;
          if (l > 0) this.trails.push({ l: l - 1, conns: anim.fwd[l - 1], born: now, pink: false });
          if (l === L) {
            this.showOutput = true;
            this.outProbs = anim.trace.acts[L];
            if (anim.cb.onOutput) anim.cb.onOutput();
          }
        }
        if (anim.bEnd > anim.fEnd) {
          // backward: layer L flashes at bStart, then L-1 ... 0
          const backAt = l => anim.bStart + (L - l) * anim.backHop;
          while (anim.backReached > 0 && t >= backAt(anim.backReached - 1)) {
            const l = --anim.backReached;
            this.flashGrad(l, anim.trace.deltas[l], l === 0 ? anim.trace.acts[0] : null);
            this.layerGlowPink[l] = 1;
            if (l < L) this.trails.push({ l, conns: anim.bwd[l], born: now, pink: true });
          }
        }
        if (t >= anim.end) {
          this.anim = null;
          if (anim.cb.onDone) anim.cb.onDone();
        }
      }
      // easing
      const kUp = 1 - Math.exp(-dt * 14), kGrad = Math.exp(-dt * 2.2), kGlow = Math.exp(-dt * 1.6);
      for (let l = 0; l < this.level.length; l++) {
        const lv = this.level[l], tg = this.target[l], gr = this.grad[l];
        for (let i = 0; i < lv.length; i++) { lv[i] += (tg[i] - lv[i]) * kUp; gr[i] *= kGrad; }
        this.layerGlow[l] *= kGlow;
        this.layerGlowPink[l] *= kGlow;
      }
      this.trails = this.trails.filter(tr => now - tr.born < 900);
    }

    lightLayer(l, acts) {
      const tg = this.target[l];
      const isOut = l === this.net.L;
      let max = 1e-6;
      if (!isOut) for (let i = 0; i < acts.length; i++) max = Math.max(max, acts[i]);
      for (let i = 0; i < acts.length; i++) tg[i] = isOut ? acts[i] : Math.pow(clamp(acts[i] / max, 0, 1), 0.7);
    }

    flashGrad(l, deltas, inputActs) {
      const gr = this.grad[l];
      let max = 1e-6;
      for (let i = 0; i < gr.length; i++) {
        const v = inputActs ? inputActs[i] : Math.abs(deltas[i]);
        max = Math.max(max, v);
      }
      for (let i = 0; i < gr.length; i++) {
        const v = inputActs ? inputActs[i] : Math.abs(deltas[i]);
        gr[i] = Math.max(gr[i], Math.pow(v / max, 0.6));
      }
    }

    /** Show a finished prediction without animating (e.g. after a resize). */
    showStatic(trace) {
      for (let l = 0; l < trace.acts.length; l++) { this.lightLayer(l, trace.acts[l]); this.level[l].set(this.target[l]); }
      this.shown = { a: trace.a, b: trace.b, digits: trace.digits, value: trace.digits[0] * 100 + trace.digits[1] * 10 + trace.digits[2], truth: trace.a + trace.b };
      this.showOutput = true;
      this.outProbs = trace.acts[trace.acts.length - 1];
    }

    // ---------------- drawing ----------------
    draw(now) {
      if (!this.net) return;
      this.update(now);
      if (this.weightsDirty) this.renderCache();
      const g = this.ctx, { W, H } = this, net = this.net, L = net.L;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.cache, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // layer glow columns
      g.globalCompositeOperation = 'lighter';
      for (let l = 0; l <= L; l++) {
        const ys = this.pos[l], y0 = ys[0], y1 = ys[ys.length - 1];
        const hgt = (y1 - y0) + 120, w = 150;
        if (this.layerGlow[l] > 0.02) {
          g.globalAlpha = this.layerGlow[l] * 0.42;
          g.drawImage(this.glow, this.xs[l] - w / 2, y0 - 60, w, hgt);
        }
        if (this.layerGlowPink[l] > 0.02) {
          g.globalAlpha = this.layerGlowPink[l] * 0.32;
          g.drawImage(this.glowPink, this.xs[l] - w / 2, y0 - 60, w, hgt);
        }
      }
      g.globalAlpha = 1;

      // fading trails of finished hops
      for (const tr of this.trails) {
        const age = (now - tr.born) / 900;
        this.drawConnLines(tr.l, tr.conns, (1 - age) * 0.5, tr.pink, tr.pink);
      }

      // live pulses
      const anim = this.anim;
      if (anim && anim.start !== null) {
        const t = now - anim.start;
        for (let l = 0; l < L; l++) {
          const s0 = anim.inDur + l * anim.hop;
          const p = (t - s0) / anim.hop;
          if (p > 0 && p < 1) this.drawPulses(l, anim.fwd[l], p, false);
        }
        if (anim.bEnd > anim.fEnd) {
          for (let l = L - 1; l >= 0; l--) {
            const s0 = anim.bStart + (L - 1 - l) * anim.backHop;
            const p = (t - s0) / anim.backHop;
            if (p > 0 && p < 1) this.drawPulses(l, anim.bwd[l], p, true);
          }
        }
      }
      g.globalCompositeOperation = 'source-over';

      this.drawNodes();
      this.drawLabels(now);
    }

    drawConnLines(l, conns, alpha, pink, backward) {
      if (alpha <= 0.01 || !conns) return;
      const g = this.ctx, xa = this.xs[l], xb = this.xs[l + 1], ya = this.pos[l], yb = this.pos[l + 1];
      g.lineWidth = 1.2;
      for (const c of conns) {
        g.strokeStyle = pink ? `rgba(255,96,170,${alpha * c.s})` : `rgba(200,160,255,${alpha * c.s})`;
        g.beginPath();
        g.moveTo(xa, ya[c.i]);
        g.lineTo(xb, yb[c.j]);
        g.stroke();
      }
    }

    drawPulses(l, conns, p, backward) {
      const g = this.ctx, xa = this.xs[l], xb = this.xs[l + 1], ya = this.pos[l], yb = this.pos[l + 1];
      const sprite = backward ? this.glowDotPink : this.glowDot;
      // the travelled part of each link lights up behind its dot
      g.lineWidth = 1.1;
      for (const c of conns) {
        const u = ease(clamp((p - c.off) / 0.6, 0, 1));
        if (u <= 0) continue;
        const sx = backward ? xb : xa, sy = backward ? yb[c.j] : ya[c.i];
        const ex = backward ? xa : xb, ey = backward ? ya[c.i] : yb[c.j];
        const x = lerp(sx, ex, u), y = lerp(sy, ey, u);
        const fade = u >= 1 ? 1 - clamp((p - c.off - 0.6) / 0.4, 0, 1) : 1;
        g.strokeStyle = backward ? `rgba(255,96,170,${0.55 * c.s * fade})` : `rgba(205,170,255,${0.6 * c.s * fade})`;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(x, y); g.stroke();
        if (u < 1) {
          const r = 5 + 6 * c.s;
          g.globalAlpha = 0.55 + 0.45 * c.s;
          g.drawImage(sprite, x - r, y - r, 2 * r, 2 * r);
          g.globalAlpha = 1;
        }
      }
    }

    drawNodes() {
      const g = this.ctx, net = this.net;
      g.globalCompositeOperation = 'lighter';
      for (let l = 0; l <= net.L; l++) {
        const x = this.xs[l], ys = this.pos[l], r = this.radius[l], lv = this.level[l], gr = this.grad[l];
        for (let i = 0; i < ys.length; i++) {
          const R = r * 4.6;
          if (lv[i] > 0.02) { g.globalAlpha = Math.min(1, lv[i]); g.drawImage(this.glow, x - R, ys[i] - R, 2 * R, 2 * R); }
          if (gr[i] > 0.03) { g.globalAlpha = Math.min(1, gr[i]); g.drawImage(this.glowPink, x - R, ys[i] - R, 2 * R, 2 * R); }
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      for (let l = 0; l <= net.L; l++) {
        const x = this.xs[l], ys = this.pos[l], r = this.radius[l], lv = this.level[l], gr = this.grad[l];
        for (let i = 0; i < ys.length; i++) {
          const v = clamp(lv[i], 0, 1), q = clamp(gr[i], 0, 1);
          g.beginPath();
          g.arc(x, ys[i], r, 0, TAU);
          g.fillStyle = '#140a20';
          g.fill();
          g.lineWidth = r > 5 ? 1.6 : 1.2;
          const cr = Math.round(lerp(lerp(118, 236, v), 255, q * 0.8));
          const cg = Math.round(lerp(lerp(86, 214, v), 120, q * 0.8));
          const cb = Math.round(lerp(lerp(168, 255, v), 190, q * 0.8));
          g.strokeStyle = `rgb(${cr},${cg},${cb})`;
          g.stroke();
          // centre dot
          g.beginPath();
          g.arc(x, ys[i], Math.max(1, r * 0.42), 0, TAU);
          g.fillStyle = `rgba(${cr},${cg},${cb},${0.35 + 0.65 * Math.max(v, q)})`;
          g.fill();
        }
      }
    }

    drawLabels(now) {
      const g = this.ctx, net = this.net, L = net.L;
      const compact = this.W < 820;
      g.textBaseline = 'middle';

      // layer titles
      const titles = net.sizes.map((n, l) => {
        if (l === 0) return ['INPUT', `${n} one-hot digits`];
        if (l === L) return ['OUTPUT', `${n} · 3 softmax heads`];
        return [`HIDDEN ${l}`, `${n} ReLU`];
      });
      const active = this.anim ? Math.max(0, this.anim.reached) : -1;
      for (let l = 0; l <= L; l++) {
        const on = Math.max(this.layerGlow[l], this.layerGlowPink[l]);
        g.textAlign = 'center';
        g.font = `600 ${compact ? 10 : 12}px ${FONT}`;
        g.fillStyle = `rgba(${Math.round(lerp(190, 255, on))},${Math.round(lerp(170, 240, on))},255,${0.65 + 0.35 * on})`;
        g.fillText(titles[l][0], this.xs[l], 26);
        g.font = `${compact ? 9 : 11}px ${FONT}`;
        g.fillStyle = 'rgba(165,150,195,0.75)';
        g.fillText(titles[l][1], this.xs[l], 43);
      }

      // input digits + group labels
      const x0 = this.xs[0], r0 = this.radius[0];
      const inFont = clamp(Math.round(this.inSpacing * 0.72), 8, 11);
      for (const grp of this.groups[0]) {
        g.textAlign = 'right';
        g.font = `600 ${inFont}px ${FONT}`;
        g.fillStyle = grp.operand === 'A' ? 'rgba(205,180,255,0.85)' : 'rgba(170,200,255,0.85)';
        g.fillText(grp.label, x0 - r0 - 6, grp.y);
        for (let k = 0; k < grp.size; k++) {
          const i = grp.start + k, lv = this.level[0][i];
          g.font = `${lv > 0.5 ? '700 ' : ''}${inFont}px ${FONT}`;
          g.fillStyle = lv > 0.5 ? '#ffffff' : 'rgba(150,135,180,0.6)';
          g.fillText(String(k), x0 - r0 - 6, this.pos[0][i]);
        }
      }

      // big A / B on the left
      if (this.shown && !compact) {
        const blocks = [['A', this.shown.a, this.groups[0].slice(0, 3)], ['B', this.shown.b, this.groups[0].slice(3)]];
        for (const [name, val, gs] of blocks) {
          const yTop = gs[0].y, last = gs[gs.length - 1];
          const yBot = this.pos[0][last.start + last.size - 1];
          const yc = (yTop + yBot) / 2;
          const lit = this.level[0].reduce((m, v) => Math.max(m, v), 0);
          g.textAlign = 'left';
          g.font = `600 12px ${FONT}`;
          g.fillStyle = 'rgba(180,160,215,0.8)';
          g.fillText(name, 18, yc - 26);
          g.font = `700 36px ${FONT}`;
          g.fillStyle = `rgba(240,232,255,${0.4 + 0.6 * lit})`;
          g.fillText(String(val), 16, yc + 6);
        }
        const gb = this.groups[0][3];
        g.font = `300 30px ${FONT}`;
        g.fillStyle = 'rgba(190,160,240,0.55)';
        g.textAlign = 'left';
        g.fillText('+', 22, gb.y - this.inSpacing * 1.6);
      }

      // output digits, probability bars, head labels
      const xL = this.xs[L], rL = this.radius[L];
      const probs = this.showOutput ? this.outProbs : null;
      const outFont = clamp(Math.round(this.outSpacing * 0.5), 9, 13);
      const barX = xL + rL + 24, barW = compact ? 44 : 78;
      for (let hi = 0; hi < this.groups[L].length; hi++) {
        const grp = this.groups[L][hi];
        g.textAlign = 'left';
        g.font = `600 ${outFont}px ${FONT}`;
        g.fillStyle = 'rgba(205,180,255,0.85)';
        g.fillText(grp.label, xL + rL + 8, grp.y);
        let best = -1;
        if (probs) { best = 0; for (let k = 1; k < grp.size; k++) if (probs[grp.start + k] > probs[grp.start + best]) best = k; }
        for (let k = 0; k < grp.size; k++) {
          const i = grp.start + k, y = this.pos[L][i];
          const p = probs ? probs[i] : 0;
          g.font = `${k === best ? '700 ' : ''}${outFont}px ${FONT}`;
          g.fillStyle = k === best ? '#ffffff' : 'rgba(150,135,180,0.65)';
          g.fillText(String(k), xL + rL + 8, y);
          const bh = Math.max(2, Math.min(8, this.outSpacing * 0.36));
          g.fillStyle = 'rgba(120,90,170,0.18)';
          roundRect(g, barX, y - bh / 2, barW, bh, bh / 2); g.fill();
          if (p > 0.004) {
            g.fillStyle = k === best ? 'rgba(206,170,255,0.95)' : 'rgba(155,107,242,0.75)';
            roundRect(g, barX, y - bh / 2, Math.max(bh, barW * p), bh, bh / 2); g.fill();
          }
          if (probs && (k === best || p >= 0.05)) {
            g.font = `${k === best ? '600 ' : ''}${Math.max(9, outFont - 1)}px ${FONT}`;
            g.fillStyle = k === best ? 'rgba(236,228,250,0.95)' : 'rgba(170,155,200,0.8)';
            g.fillText(fmtPct(p), barX + barW + 6, y);
          }
        }
      }

      // big answer on the right
      if (!compact) {
        const xr = this.W - 18;
        const yc = (this.pos[L][0] + this.pos[L][this.pos[L].length - 1]) / 2;
        g.textAlign = 'right';
        g.font = `600 12px ${FONT}`;
        g.fillStyle = 'rgba(180,160,215,0.8)';
        g.fillText('MODEL SAYS', xr, yc - 34);
        g.font = `700 40px ${FONT}`;
        if (this.shown && this.showOutput) {
          g.fillStyle = '#f4eeff';
          g.fillText(String(this.shown.value), xr, yc);
          g.font = `600 12px ${FONT}`;
          const ok = this.shown.value === this.shown.truth;
          g.fillStyle = ok ? '#4fd1c1' : '#ff7a93';
          g.fillText(ok ? '✓ correct' : `✗ true: ${this.shown.truth}`, xr, yc + 32);
        } else {
          g.fillStyle = 'rgba(200,180,240,0.35)';
          g.fillText('?', xr, yc);
        }
      }

      // caption
      g.textAlign = 'center';
      g.font = `500 ${compact ? 11 : 13}px ${FONT}`;
      g.fillStyle = 'rgba(232,222,250,0.92)';
      g.fillText(this.caption || '', this.W / 2, this.H - 34);
      g.font = `${compact ? 10 : 12}px ${FONT}`;
      g.fillStyle = 'rgba(165,150,195,0.8)';
      g.fillText(this.subcaption || '', this.W / 2, this.H - 15);
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function fmtPct(p) {
    if (p >= 0.995) return '>99%';
    if (p < 0.01) return '<1%';
    return Math.round(p * 100) + '%';
  }

  root.NetworkViz = NetworkViz;
  root.fmtPct = fmtPct;
})(window);
