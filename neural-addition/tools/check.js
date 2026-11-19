// Sanity checks for nn.js:
//   1. backprop gradients match numerical gradients
//   2. the recommended setup (same as the web app) learns addition and
//      answers unseen equations correctly
// Usage: node tools/check.js
const NN = require('../nn.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`); if (!ok) failed++; };

// ---- 1. gradient check ----
{
  const net = new NN.Network([NN.INPUT_SIZE, 6, 5, NN.OUTPUT_SIZE], 7);
  const a = 47, b = 85, y = NN.targetDigits(a, b), x = NN.encodeInput(a, b);
  const lossAt = () => { net.forward(x); const out = net.a[net.L]; return NN.OUTPUT_HEADS.reduce((s, h, i) => s - Math.log(out[h.offset + y[i]]), 0); };
  net.gW.forEach(g => g.fill(0)); net.gb.forEach(g => g.fill(0));
  net.forward(x); net.backward(y);
  let worst = 0;
  for (let l = 0; l < net.L; l++) {
    for (let t = 0; t < 40; t++) {
      const k = Math.floor(Math.random() * net.W[l].length);
      const old = net.W[l][k], h = 2e-3;
      const pattern = () => net.a.slice(1, -1).map(v => Array.from(v, z => z > 0 ? 1 : 0).join('')).join('|');
      net.W[l][k] = old + h; const lp = lossAt(); const pp = pattern();
      net.W[l][k] = old - h; const lm = lossAt(); const pm = pattern();
      net.W[l][k] = old;
      if (pp !== pm) continue; // the nudge flipped a ReLU on/off: finite differences are meaningless there
      const num = (lp - lm) / (2 * h), ana = net.gW[l][k];
      // float32 weights: allow ~1e-3 absolute noise plus 1% relative error
      worst = Math.max(worst, Math.abs(num - ana) / (1e-3 + 0.01 * Math.abs(ana)));
    }
  }
  check('backprop matches numerical gradient', worst < 1, `worst error ${worst.toFixed(3)} of tolerance`);
}

// ---- 2. dataset coverage ----
const data = NN.makeDataset(3000, 42);
{
  const c = data.coverage, pc = NN.patternCoverage(data.train);
  check('every A, B, C value is in training', Math.min(...c.countA) >= 3 && Math.min(...c.countB) >= 3 && Math.min(...c.countC) >= 1,
    `min A ${Math.min(...c.countA)}, B ${Math.min(...c.countB)}, C ${Math.min(...c.countC)}`);
  check('all ones pairs and tens+carry cases', pc.onesPairs === 100 && pc.tensCases === 200, `${pc.onesPairs}/100, ${pc.tensCases}/200`);
  const minRare = Math.min(...pc.rare.map(r => r.trained / r.size));
  check('rare patterns studied more densely than average', minRare >= Math.min(0.6, 1.5 * pc.overallDensity) - 0.01 && pc.rare.every(r => r.trained < r.size),
    `rare groups ≥ ${(minRare * 100).toFixed(0)}% trained vs ${(pc.overallDensity * 100).toFixed(0)}% overall; some of each left unseen`);
  const overlap = data.test.filter(([a, b]) => data.isTrain[a * 101 + b]).length;
  check('test set never overlaps training', overlap === 0 && data.train.length + data.test.length === 10201,
    `${data.train.length} train + ${data.test.length} test`);
}

// ---- 3. training (same schedule as the app) ----
{
  const EPOCHS = 60, BATCH = 32, LR_MAX = 0.005, LR_MIN = 0.0003, WD = 1e-3;
  const net = new NN.Network([NN.INPUT_SIZE, 48, 32, 24, NN.OUTPUT_SIZE], 1);
  const before = net.accuracy(data.testEnc).exact;
  const idx = data.trainEnc.x.map((_, i) => i), rand = NN.makeRng(5);
  const t0 = Date.now();
  for (let e = 0; e < EPOCHS; e++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let s = 0; s < idx.length; s += BATCH) {
      const lr = LR_MIN + (LR_MAX - LR_MIN) * 0.5 * (1 + Math.cos(Math.PI * (e + s / idx.length) / EPOCHS));
      net.trainBatch(data.trainEnc, idx.slice(s, s + BATCH), lr, WD);
    }
  }
  const tr = net.accuracy(data.trainEnc).exact, te = net.accuracy(data.testEnc).exact;
  check('untrained network is clueless', before < 0.02, `${(before * 100).toFixed(2)}% on unseen`);
  check('trained network fits training set', tr > 0.98, `${(tr * 100).toFixed(2)}%`);
  check('trained network generalises to unseen equations', te > 0.97, `${(te * 100).toFixed(2)}% of ${data.test.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const p = net.predict(37, 48), top = NN.topCandidates(p.acts[p.acts.length - 1], 5);
  const sum = top.reduce((s, c) => s + c.p, 0);
  check('top-5 candidates are ranked probabilities', top.every((c, i) => i === 0 || c.p <= top[i - 1].p) && sum <= 1.0001,
    `37+48 -> ${top.map(c => `${c.value} ${(c.p * 100).toFixed(1)}%`).join(', ')}`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
