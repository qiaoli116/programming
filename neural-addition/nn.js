/*
 * nn.js — a tiny neural network written from scratch (no libraries).
 *
 * Task: learn A + B = C for A, B in 0..100 (so C is in 0..200).
 *
 * Input  (44 nodes): each digit of A and B is one-hot encoded.
 *   A hundreds (0-1) | A tens (0-9) | A ones (0-9) | B hundreds | B tens | B ones
 *     2 nodes            10 nodes       10 nodes       2            10       10
 *
 * Output (23 nodes): three classification heads, one per digit of C.
 *   C hundreds (0-2) | C tens (0-9) | C ones (0-9)
 *     3 nodes           10 nodes       10 nodes
 *   Each head has its own softmax; the loss is the sum of the three
 *   cross-entropies.
 *
 * Hidden layers use ReLU. Training uses mini-batch Adam.
 * Works both in the browser (window.NN) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- deterministic random numbers ----------
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rand) {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }

  // ---------- problem encoding ----------
  const MAX = 100;

  const INPUT_GROUPS = [
    { label: 'A hundreds', short: 'A·100', operand: 'A', place: 100, size: 2 },
    { label: 'A tens', short: 'A·10', operand: 'A', place: 10, size: 10 },
    { label: 'A ones', short: 'A·1', operand: 'A', place: 1, size: 10 },
    { label: 'B hundreds', short: 'B·100', operand: 'B', place: 100, size: 2 },
    { label: 'B tens', short: 'B·10', operand: 'B', place: 10, size: 10 },
    { label: 'B ones', short: 'B·1', operand: 'B', place: 1, size: 10 },
  ];
  const OUTPUT_HEADS = [
    { label: 'C hundreds', short: 'C·100', place: 100, size: 3 },
    { label: 'C tens', short: 'C·10', place: 10, size: 10 },
    { label: 'C ones', short: 'C·1', place: 1, size: 10 },
  ];
  let off = 0;
  for (const g of INPUT_GROUPS) { g.offset = off; off += g.size; }
  const INPUT_SIZE = off;
  off = 0;
  for (const h of OUTPUT_HEADS) { h.offset = off; off += h.size; }
  const OUTPUT_SIZE = off;

  function digitOf(n, place) { return Math.floor(n / place) % 10; }

  function encodeInput(a, b, out) {
    out = out || new Float32Array(INPUT_SIZE);
    out.fill(0);
    for (const g of INPUT_GROUPS) {
      const v = g.operand === 'A' ? a : b;
      out[g.offset + digitOf(v, g.place)] = 1;
    }
    return out;
  }
  function targetDigits(a, b) {
    const c = a + b;
    return OUTPUT_HEADS.map(h => digitOf(c, h.place));
  }

  // ---------- dataset ----------
  // The universe is all 101 x 101 = 10,201 equations A + B with A, B in 0..100.
  //
  // The TRAINING set is built in stages so it is guaranteed to cover:
  //   1. every value of A (0..100) at least `perValue` times
  //   2. every value of B (0..100) at least `perValue` times
  //   3. every value of C (0..200) at least once
  //   4. every ones-digit pair (a1, b1): all 100 "ones column" sums, with and without carry
  //   5. every tens-digit pair (a10, b10) both with and without a carry coming in
  //   6. (balance: true, the default) the RARE patterns are studied at 1.5x the
  //      density of everything else:
  //      - extreme tens-column totals (tens of A + tens of B + carry = 0-2 or 17-19).
  //        Like two dice, extreme totals come from very few digit pairs (0-1 only
  //        from 0+0, 18-19 only from 9+9), so uniform sampling starves them.
  //      - A = 100 and B = 100: the only sums that switch on the "hundreds = 1" input.
  //      Capped at 60% of each group so part of it always stays unseen for testing.
  // then it is topped up with random equations until it reaches `trainCount`.
  //
  // The TEST set is every equation that is NOT in the training set, so every
  // test question is one the network has never seen.
  const CELL = MAX + 1;
  const tensTotal = (a, b) => Math.floor(a / 10) % 10 + Math.floor(b / 10) % 10 + ((a % 10) + (b % 10) >= 10 ? 1 : 0);
  const RARE_CAP = 0.6, RARE_BOOST = 1.5, RARE_TOTALS = [0, 1, 2, 17, 18, 19];
  /** Share of each rare group to train on, for a training set of n sums. */
  const rareDensity = (n, boost) => Math.min(RARE_CAP, (boost || RARE_BOOST) * n / (CELL * CELL));
  /** The rare groups: extreme tens-column totals (A, B < 100) and the two "100" lines. */
  const RARE_GROUPS = (() => {
    const groups = RARE_TOTALS.map(s => ({ name: `tens column totals ${s}`, sums: [] }));
    const lineA = { name: 'A = 100', sums: [] }, lineB = { name: 'B = 100', sums: [] };
    for (let a = 0; a <= MAX; a++) for (let b = 0; b <= MAX; b++) {
      if (a === MAX) lineA.sums.push([a, b]);
      else if (b === MAX) lineB.sums.push([a, b]);
      else { const k = RARE_TOTALS.indexOf(tensTotal(a, b)); if (k >= 0) groups[k].sums.push([a, b]); }
    }
    return groups.concat([lineA, lineB]);
  })();
  function makeDataset(trainCount, seed, opts) {
    opts = opts || {};
    const perValue = opts.perValue || 3, balance = opts.balance !== false;
    const rand = makeRng(seed);
    const pick = arr => arr[Math.floor(rand() * arr.length)];
    const isTrain = new Uint8Array(CELL * CELL);
    const train = [];
    const reason = new Map(); // "a,b" -> why it was chosen (for display)
    const add = (a, b, why) => {
      if (a < 0 || b < 0 || a > MAX || b > MAX || isTrain[a * CELL + b]) return false;
      isTrain[a * CELL + b] = 1;
      train.push([a, b]);
      reason.set(a + ',' + b, why);
      return true;
    };
    const values = [];
    for (let v = 0; v <= MAX; v++) values.push(v);

    // 1 + 2: every A and every B value
    for (let v = 0; v <= MAX; v++) {
      let n = 0, guard = 0;
      while (n < perValue && guard++ < 500) if (add(v, pick(values), 'covers A=' + v)) n++;
      n = 0; guard = 0;
      while (n < perValue && guard++ < 500) if (add(pick(values), v, 'covers B=' + v)) n++;
    }
    // 3: every sum C
    for (let c = 0; c <= 2 * MAX; c++) {
      const lo = Math.max(0, c - MAX), hi = Math.min(MAX, c);
      let has = false;
      for (let a = lo; a <= hi && !has; a++) has = !!isTrain[a * CELL + (c - a)];
      if (has) continue;
      for (let guard = 0; guard < 500; guard++) {
        const a = lo + Math.floor(rand() * (hi - lo + 1));
        if (add(a, c - a, 'covers C=' + c)) break;
      }
    }
    // 4: every ones-digit pair
    const hasPattern = test => train.some(([a, b]) => test(a, b));
    for (let a1 = 0; a1 < 10; a1++) for (let b1 = 0; b1 < 10; b1++) {
      if (hasPattern((a, b) => a % 10 === a1 && b % 10 === b1)) continue;
      for (let guard = 0; guard < 200; guard++) {
        const a = Math.floor(rand() * 10) * 10 + a1, b = Math.floor(rand() * 10) * 10 + b1;
        if (add(a, b, `ones ${a1}+${b1}`)) break;
      }
    }
    // 5: every tens-digit pair, with and without a carry from the ones column
    for (let a10 = 0; a10 < 10; a10++) for (let b10 = 0; b10 < 10; b10++) for (const carry of [0, 1]) {
      const match = (a, b) => a < 100 && b < 100 && Math.floor(a / 10) === a10 && Math.floor(b / 10) === b10 &&
        ((a % 10 + b % 10 >= 10) ? 1 : 0) === carry;
      if (hasPattern(match)) continue;
      for (let guard = 0; guard < 200; guard++) {
        const a = a10 * 10 + Math.floor(rand() * 10), b = b10 * 10 + Math.floor(rand() * 10);
        if (match(a, b) && add(a, b, `tens ${a10}+${b10}${carry ? ' +carry' : ''}`)) break;
      }
    }
    // 6: extra examples for the rare patterns
    if (balance) {
      const density = rareDensity(trainCount, opts.boost);
      for (const g of RARE_GROUPS) {
        const target = Math.floor(density * g.sums.length);
        const free = g.sums.filter(([a, b]) => !isTrain[a * CELL + b]);
        let have = g.sums.length - free.length;
        for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const x = free[i]; free[i] = free[j]; free[j] = x; }
        for (let i = 0; have < target && i < free.length; i++) if (add(free[i][0], free[i][1], 'rare: ' + g.name)) have++;
      }
    }
    const required = train.length;
    // top up with random equations
    const rest = [];
    for (let a = 0; a <= MAX; a++) for (let b = 0; b <= MAX; b++) if (!isTrain[a * CELL + b]) rest.push([a, b]);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
    }
    const want = Math.min(CELL * CELL - 100, Math.max(trainCount, required));
    for (let i = 0; train.length < want && i < rest.length; i++) add(rest[i][0], rest[i][1], 'random');
    const test = rest.filter(([a, b]) => !isTrain[a * CELL + b]);

    // coverage stats for display
    const countA = new Uint16Array(CELL), countB = new Uint16Array(CELL), countC = new Uint16Array(2 * MAX + 1);
    for (const [a, b] of train) { countA[a]++; countB[b]++; countC[a + b]++; }

    const enc = list => ({
      x: list.map(([a, b]) => encodeInput(a, b)),
      y: list.map(([a, b]) => targetDigits(a, b)),
    });
    return {
      train, test, isTrain, reason, required, balanced: balance,
      coverage: { countA, countB, countC },
      trainEnc: enc(train), testEnc: enc(test),
    };
  }

  // ---------- network ----------
  class Network {
    /** sizes e.g. [44, 64, 32, 23] */
    constructor(sizes, seed) {
      this.sizes = sizes.slice();
      this.L = sizes.length - 1; // number of weight layers
      this.rand = makeRng(seed == null ? 1 : seed);
      this.W = []; this.b = [];
      this.gW = []; this.gb = [];
      this.mW = []; this.vW = []; this.mb = []; this.vb = [];
      for (let l = 0; l < this.L; l++) {
        const nin = sizes[l], nout = sizes[l + 1];
        const W = new Float32Array(nin * nout);
        const scale = Math.sqrt(2 / nin); // He init for ReLU
        for (let k = 0; k < W.length; k++) W[k] = gaussian(this.rand) * scale;
        this.W.push(W);
        this.b.push(new Float32Array(nout));
        this.gW.push(new Float32Array(nin * nout));
        this.gb.push(new Float32Array(nout));
        this.mW.push(new Float32Array(nin * nout));
        this.vW.push(new Float32Array(nin * nout));
        this.mb.push(new Float32Array(nout));
        this.vb.push(new Float32Array(nout));
      }
      // scratch buffers: activations a[l] and deltas d[l]
      this.a = sizes.map(n => new Float32Array(n));
      this.d = sizes.map(n => new Float32Array(n));
      this.idx = new Int32Array(Math.max(...sizes));
      this.step = 0;
      this.paramCount = this.W.reduce((s, w) => s + w.length, 0) +
        this.b.reduce((s, v) => s + v.length, 0);
    }

    /** Indices of the non-zero entries of v (one-hot inputs and ReLU make most of them zero). */
    active(v) {
      const idx = this.idx;
      let n = 0;
      for (let i = 0; i < v.length; i++) if (v[i] !== 0) idx[n++] = i;
      return n;
    }

    /** Forward pass. Leaves activations in this.a; last layer holds per-head softmax probs. */
    forward(x) {
      const a = this.a, idx = this.idx;
      a[0].set(x);
      for (let l = 0; l < this.L; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1];
        const W = this.W[l], bias = this.b[l], ain = a[l], aout = a[l + 1];
        const last = l === this.L - 1;
        const nnz = this.active(ain);
        for (let j = 0; j < nout; j++) {
          let s = bias[j];
          const row = j * nin;
          for (let k = 0; k < nnz; k++) { const i = idx[k]; s += W[row + i] * ain[i]; }
          aout[j] = last ? s : (s > 0 ? s : 0);
        }
      }
      // per-head softmax on the output layer
      const out = a[this.L];
      for (const h of OUTPUT_HEADS) {
        let m = -Infinity;
        for (let k = 0; k < h.size; k++) m = Math.max(m, out[h.offset + k]);
        let z = 0;
        for (let k = 0; k < h.size; k++) { const e = Math.exp(out[h.offset + k] - m); out[h.offset + k] = e; z += e; }
        for (let k = 0; k < h.size; k++) out[h.offset + k] /= z;
      }
      return out;
    }

    /** Backprop for one sample (after forward). Accumulates gradients, returns loss. */
    backward(target) {
      const a = this.a, d = this.d, L = this.L;
      const out = a[L], dout = d[L];
      let loss = 0;
      for (let hi = 0; hi < OUTPUT_HEADS.length; hi++) {
        const h = OUTPUT_HEADS[hi];
        for (let k = 0; k < h.size; k++) {
          const p = out[h.offset + k];
          const y = k === target[hi] ? 1 : 0;
          dout[h.offset + k] = p - y;
          if (y) loss -= Math.log(Math.max(p, 1e-12));
        }
      }
      const idx = this.idx;
      for (let l = L - 1; l >= 0; l--) {
        const nin = this.sizes[l], nout = this.sizes[l + 1];
        const W = this.W[l], gW = this.gW[l], gb = this.gb[l];
        const ain = a[l], dnext = d[l + 1], dprev = d[l];
        // Only active inputs get a weight gradient, and (ReLU') only active
        // hidden nodes pass a gradient further back, so one index list serves both.
        const nnz = this.active(ain);
        dprev.fill(0);
        for (let j = 0; j < nout; j++) {
          const dj = dnext[j];
          if (dj === 0) continue;
          gb[j] += dj;
          const row = j * nin;
          for (let k = 0; k < nnz; k++) {
            const i = idx[k];
            gW[row + i] += dj * ain[i];
            dprev[i] += W[row + i] * dj;
          }
        }
      }
      return loss;
    }

    /** One Adam step on a mini-batch of indices into enc. Returns mean loss. */
    trainBatch(enc, indices, lr, weightDecay) {
      for (let l = 0; l < this.L; l++) { this.gW[l].fill(0); this.gb[l].fill(0); }
      let loss = 0;
      for (const idx of indices) {
        this.forward(enc.x[idx]);
        loss += this.backward(enc.y[idx]);
      }
      const n = indices.length;
      this.step++;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      const c1 = 1 - Math.pow(b1, this.step), c2 = 1 - Math.pow(b2, this.step);
      const wd = weightDecay || 0;
      for (let l = 0; l < this.L; l++) {
        const W = this.W[l], gW = this.gW[l], mW = this.mW[l], vW = this.vW[l];
        for (let k = 0; k < W.length; k++) {
          const g = gW[k] / n + wd * W[k];
          mW[k] = b1 * mW[k] + (1 - b1) * g;
          vW[k] = b2 * vW[k] + (1 - b2) * g * g;
          W[k] -= lr * (mW[k] / c1) / (Math.sqrt(vW[k] / c2) + eps);
        }
        const bias = this.b[l], gb = this.gb[l], mb = this.mb[l], vb = this.vb[l];
        for (let k = 0; k < bias.length; k++) {
          const g = gb[k] / n;
          mb[k] = b1 * mb[k] + (1 - b1) * g;
          vb[k] = b2 * vb[k] + (1 - b2) * g * g;
          bias[k] -= lr * (mb[k] / c1) / (Math.sqrt(vb[k] / c2) + eps);
        }
      }
      return loss / n;
    }

    /** Predicted digits from the current output probabilities. */
    argmaxHeads() {
      const out = this.a[this.L];
      return OUTPUT_HEADS.map(h => {
        let best = 0;
        for (let k = 1; k < h.size; k++) if (out[h.offset + k] > out[h.offset + best]) best = k;
        return best;
      });
    }

    /** Full prediction for a + b with a snapshot of every layer (for the visual). */
    predict(a, b) {
      this.forward(encodeInput(a, b));
      const digits = this.argmaxHeads();
      const value = digits[0] * 100 + digits[1] * 10 + digits[2];
      return {
        a, b, digits, value,
        truth: a + b,
        correct: value === a + b,
        acts: this.a.map(v => Float32Array.from(v)),
      };
    }

    /** Forward + backward for one sample without touching the weights: activations and node gradients. */
    trace(a, b) {
      const x = encodeInput(a, b);
      this.forward(x);
      const acts = this.a.map(v => Float32Array.from(v));
      const digits = this.argmaxHeads();
      // backward into scratch gradient buffers, then restore them
      const saveW = this.gW.map(g => Float32Array.from(g));
      const saveb = this.gb.map(g => Float32Array.from(g));
      const loss = this.backward(targetDigits(a, b));
      const deltas = this.d.map(v => Float32Array.from(v));
      this.gW.forEach((g, l) => g.set(saveW[l]));
      this.gb.forEach((g, l) => g.set(saveb[l]));
      return { a, b, acts, deltas, digits, loss };
    }

    /** Accuracy (whole answer exactly right) over an encoded set. */
    accuracy(enc, limit) {
      const n = Math.min(enc.x.length, limit || Infinity);
      let ok = 0;
      const headOk = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        this.forward(enc.x[i]);
        const p = this.argmaxHeads(), y = enc.y[i];
        let all = true;
        for (let h = 0; h < 3; h++) { if (p[h] === y[h]) headOk[h]++; else all = false; }
        if (all) ok++;
      }
      return { exact: n ? ok / n : 0, heads: headOk.map(v => (n ? v / n : 0)) };
    }
  }

  /**
   * The model's top-k whole answers. The three heads are separate softmaxes,
   * so P(C = 132) = P(hundreds=1) * P(tens=3) * P(ones=2). All 3*10*10 = 300
   * combinations are scored and the k most likely are returned.
   */
  function topCandidates(probs, k) {
    const [H, T, O] = OUTPUT_HEADS;
    const list = [];
    for (let h = 0; h < H.size; h++) for (let t = 0; t < T.size; t++) for (let o = 0; o < O.size; o++) {
      const ph = probs[H.offset + h], pt = probs[T.offset + t], po = probs[O.offset + o];
      list.push({ value: h * 100 + t * 10 + o, p: ph * pt * po, parts: [ph, pt, po], digits: [h, t, o] });
    }
    list.sort((x, y) => y.p - x.p);
    return list.slice(0, k || 5);
  }

  /** Which digit patterns the training set covers (for the coverage checklist). */
  function patternCoverage(train) {
    const ones = new Set(), tens = new Set();
    for (const [a, b] of train) {
      ones.add((a % 10) * 10 + (b % 10));
      if (a < 100 && b < 100) {
        const carry = (a % 10) + (b % 10) >= 10 ? 1 : 0;
        tens.add(Math.floor(a / 10) * 100 + Math.floor(b / 10) * 10 + carry * 1000);
      }
    }
    // how densely each rare group is trained, compared with the training set as a whole
    const isTrain = new Set(train.map(([a, b]) => a * CELL + b));
    const rare = RARE_GROUPS.map(g => ({ name: g.name, size: g.sums.length, trained: g.sums.filter(([a, b]) => isTrain.has(a * CELL + b)).length }));
    return { onesPairs: ones.size, tensCases: tens.size, rare, overallDensity: train.length / (CELL * CELL) };
  }

  const api = {
    MAX, INPUT_GROUPS, OUTPUT_HEADS, INPUT_SIZE, OUTPUT_SIZE,
    makeRng, encodeInput, targetDigits, digitOf, makeDataset, Network,
    topCandidates, patternCoverage, tensTotal, rareDensity,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NN = api;
})(typeof window !== 'undefined' ? window : globalThis);
