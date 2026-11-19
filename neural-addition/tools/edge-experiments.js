// Is the edge/corner error pattern caused by the data or by the model?
// Runs several variants of the app's recipe and compares error by region.
// Usage: node tools/edge-experiments.js [runs=6]
const NN = require('../nn.js');
const RUNS = +process.argv[2] || 6, N = 101;
const EPOCHS = 60, BATCH = 32, LR_MAX = 0.005, LR_MIN = 0.0003, WD = 1e-3;

const enc = list => ({ x: list.map(([a, b]) => NN.encodeInput(a, b)), y: list.map(([a, b]) => NN.targetDigits(a, b)) });
function fromTrain(train) {
  const isTrain = new Uint8Array(N * N); train.forEach(([a, b]) => { isTrain[a * N + b] = 1; });
  const test = []; for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (!isTrain[a * N + b]) test.push([a, b]);
  return { train, test, isTrain, trainEnc: enc(train), testEnc: enc(test) };
}
function trainNet(data, seed, hidden, wd = WD) {
  const net = new NN.Network([NN.INPUT_SIZE, ...hidden, NN.OUTPUT_SIZE], seed);
  const idx = data.trainEnc.x.map((_, i) => i), rand = NN.makeRng(seed + 100);
  for (let e = 0; e < EPOCHS; e++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let s = 0; s < idx.length; s += BATCH) {
      const lr = LR_MIN + (LR_MAX - LR_MIN) * 0.5 * (1 + Math.cos(Math.PI * (e + s / idx.length) / EPOCHS));
      net.trainBatch(data.trainEnc, idx.slice(s, s + BATCH), lr, wd);
    }
  }
  return net;
}

const tens = v => Math.floor(v / 10);
// the tens column adds ta + tb + (carry from the ones column): 0..19
const tensTotal = (a, b) => tens(a) + tens(b) + ((a % 10) + (b % 10) >= 10 ? 1 : 0);
const REGIONS = {
  'A or B = 100': (a, b) => a === 100 || b === 100,
  'tens total 0-2 / 17-19': (a, b) => a < 100 && b < 100 && (tensTotal(a, b) <= 2 || tensTotal(a, b) >= 17),
  'everything else': (a, b) => a < 100 && b < 100 && tensTotal(a, b) > 2 && tensTotal(a, b) < 17,
};
const rare = (a, b) => REGIONS['A or B = 100'](a, b) || REGIONS['tens total 0-2 / 17-19'](a, b);

const UNIFORM = { balance: false }, BALANCED = { balance: true };
const VARIANTS = {
  'baseline: 48-32-24, 3000 sums':        { hidden: [48, 32, 24], data: r => NN.makeDataset(3000, 1000 + r, UNIFORM) },
  'bigger net: 96-64-48, 3000 sums':      { hidden: [96, 64, 48], data: r => NN.makeDataset(3000, 1000 + r, UNIFORM) },
  'double data: 48-32-24, 6000 sums':     { hidden: [48, 32, 24], data: r => NN.makeDataset(6000, 1000 + r, UNIFORM) },
  'weight decay 1e-4 (was 1e-3)':         { hidden: [48, 32, 24], wd: 1e-4, data: r => NN.makeDataset(3000, 1000 + r, UNIFORM) },
  'no weight decay':                      { hidden: [48, 32, 24], wd: 0, data: r => NN.makeDataset(3000, 1000 + r, UNIFORM) },
  'BALANCED (new): 3000 sums':            { hidden: [48, 32, 24], data: r => NN.makeDataset(3000, 1000 + r, BALANCED) },
  'uniform: 2000 sums':                   { hidden: [48, 32, 24], data: r => NN.makeDataset(2000, 1000 + r, UNIFORM) },
  'BALANCED (new): 2000 sums':            { hidden: [48, 32, 24], data: r => NN.makeDataset(2000, 1000 + r, BALANCED) },
  'uniform: 1500 sums':                   { hidden: [48, 32, 24], data: r => NN.makeDataset(1500, 1000 + r, UNIFORM) },
  'BALANCED (new): 1500 sums':            { hidden: [48, 32, 24], data: r => NN.makeDataset(1500, 1000 + r, BALANCED) },
  'rebalanced: 48-32-24, same 3000 sums': {
    hidden: [48, 32, 24],
    data: r => {
      // same coverage-guaranteed set, but swap 400 random "common" sums for 400 sums from the rare regions
      const base = NN.makeDataset(3000, 1000 + r, UNIFORM), rand = NN.makeRng(77 + r);
      const train = base.train.slice(), isTrain = base.isTrain.slice();
      const pool = []; for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (rare(a, b) && !isTrain[a * N + b]) pool.push([a, b]);
      const extra = []; while (extra.length < 400 && pool.length) extra.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      const randomCommon = train.map((p, i) => [p, i]).filter(([[a, b], i]) => i >= base.required && !rare(a, b));
      const drop = new Set(); while (drop.size < extra.length) drop.add(randomCommon[Math.floor(rand() * randomCommon.length)][1]);
      return fromTrain(train.filter((_, i) => !drop.has(i)).concat(extra));
    },
  },
};

const pct = (w, t) => (t ? (100 * w / t).toFixed(2) : '-').padStart(6) + '%';
console.log(`${RUNS} runs per variant; error = share of UNSEEN sums in the region answered wrong\n`);
console.log('variant'.padEnd(40) + Object.keys(REGIONS).map(k => k.padStart(24)).join('') + '     overall');
const byTotal = {};
for (const [name, v] of Object.entries(VARIANTS)) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
  const t = {}, w = {}; let T = 0, Wr = 0;
  const tt = new Float64Array(20), tw = new Float64Array(20), ttrain = new Float64Array(20);
  for (const k in REGIONS) { t[k] = 0; w[k] = 0; }
  for (let r = 0; r < RUNS; r++) {
    const data = v.data(r), net = trainNet(data, 1 + r, v.hidden, v.wd);
    for (const [a, b] of data.train) if (a < 100 && b < 100) ttrain[tensTotal(a, b)]++;
    for (const [a, b] of data.test) {
      const bad = net.predict(a, b).digits.some((d, h) => d !== NN.targetDigits(a, b)[h]);
      for (const k in REGIONS) if (REGIONS[k](a, b)) { t[k]++; w[k] += bad; }
      T++; Wr += bad;
      if (a < 100 && b < 100) { tt[tensTotal(a, b)]++; tw[tensTotal(a, b)] += bad; }
    }
    process.stderr.write(`${name} run ${r + 1}/${RUNS}   \r`);
  }
  byTotal[name] = { tt, tw, ttrain };
  console.log(name.padEnd(40) + Object.keys(REGIONS).map(k => pct(w[k], t[k]).padStart(24)).join('') + pct(Wr, T).padStart(12));
}

console.log('\nBaseline, by the tens-column total ta + tb + carry (A, B < 100):');
console.log('total  sums-in-universe  trained/run  error-on-unseen');
const universe = new Array(20).fill(0);
for (let a = 0; a < 100; a++) for (let b = 0; b < 100; b++) universe[tensTotal(a, b)]++;
const bt = byTotal['baseline: 48-32-24, 3000 sums'];
if (bt)
for (let s = 0; s < 20; s++) if (bt)
  console.log(`${String(s).padStart(5)}  ${String(universe[s]).padStart(16)}  ${(bt.ttrain[s] / RUNS).toFixed(0).padStart(11)}  ${pct(bt.tw[s], bt.tt[s]).padStart(15)}`);
