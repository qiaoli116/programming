// Where do the unseen-sum errors come from?  Trains several networks with the
// app's exact recipe and breaks every error down by region, digit head and carry.
// Usage: node tools/edge-analysis.js [runs=10] [trainCount=3000]
const NN = require('../nn.js');
const RUNS = +process.argv[2] || 10, COUNT = +process.argv[3] || 3000;
const EPOCHS = 60, BATCH = 32, LR_MAX = 0.005, LR_MIN = 0.0003, WD = 1e-3, N = 101;

function train(data, seed, hidden = [48, 32, 24]) {
  const net = new NN.Network([NN.INPUT_SIZE, ...hidden, NN.OUTPUT_SIZE], seed);
  const idx = data.trainEnc.x.map((_, i) => i), rand = NN.makeRng(seed + 100);
  for (let e = 0; e < EPOCHS; e++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let s = 0; s < idx.length; s += BATCH) {
      const lr = LR_MIN + (LR_MAX - LR_MIN) * 0.5 * (1 + Math.cos(Math.PI * (e + s / idx.length) / EPOCHS));
      net.trainBatch(data.trainEnc, idx.slice(s, s + BATCH), lr, WD);
    }
  }
  return net;
}

const tested = new Float64Array(N * N), wrong = new Float64Array(N * N), trained = new Float64Array(N * N);
const headWrong = new Float64Array(N * N * 3);
for (let r = 0; r < RUNS; r++) {
  const data = NN.makeDataset(COUNT, 1000 + r, { balance: process.env.BALANCE !== "0" });
  const net = train(data, 1 + r);
  for (const [a, b] of data.train) trained[a * N + b]++;
  for (const [a, b] of data.test) {
    const k = a * N + b, p = net.predict(a, b), y = NN.targetDigits(a, b);
    tested[k]++;
    let bad = false;
    p.digits.forEach((d, h) => { if (d !== y[h]) { headWrong[k * 3 + h]++; bad = true; } });
    if (bad) wrong[k]++;
  }
  process.stderr.write(`run ${r + 1}/${RUNS}\r`);
}

const pct = (w, t) => t ? (100 * w / t).toFixed(2).padStart(6) + '%' : '    - ';
function group(name, pred) {
  let t = 0, w = 0, tr = 0, cells = 0; const hw = [0, 0, 0];
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (pred(a, b)) {
    const k = a * N + b; cells++; t += tested[k]; w += wrong[k]; tr += trained[k];
    for (let h = 0; h < 3; h++) hw[h] += headWrong[k * 3 + h];
  }
  console.log(`${name.padEnd(44)} cells ${String(cells).padStart(5)}  trained ${(100 * tr / (cells * RUNS)).toFixed(0).padStart(3)}%  ` +
    `error ${pct(w, t)}   share of all errors ${pct(w, totalW)}   by head h/t/o: ${hw.map(x => Math.round(x)).join('/')}`);
}
let totalW = 0; for (let k = 0; k < N * N; k++) totalW += wrong[k];
const carry1 = (a, b) => (a % 10) + (b % 10) >= 10;
const tens = v => Math.floor(v / 10) % 10;

console.log(`\n${RUNS} runs x ${COUNT} training sums; ${totalW} wrong answers in total\n`);
console.log('--- regions ---');
group('everything', () => true);
group('A = 100 or B = 100', (a, b) => a === 100 || b === 100);
group('A < 10 or B < 10 (not 100)', (a, b) => (a < 10 || b < 10) && a < 100 && b < 100);
group('  both A < 10 and B < 10', (a, b) => a < 10 && b < 10);
group('A >= 90 or B >= 90 (not 100)', (a, b) => (a >= 90 || b >= 90) && a < 100 && b < 100);
group('interior (10..89 both)', (a, b) => a >= 10 && a < 90 && b >= 10 && b < 90);

console.log('\n--- by the tens digit of A (rows of the map) ---');
for (let t = 0; t < 10; t++) group(`A = ${t * 10}..${t * 10 + 9}`, (a, b) => a < 100 && Math.floor(a / 10) === t);
group('A = 100', a => a === 100);

console.log('\n--- does the ones column carry? ---');
group('no carry from ones', (a, b) => !carry1(a, b));
group('carry from ones', (a, b) => carry1(a, b));
group('A<10,B<10 no carry', (a, b) => a < 10 && b < 10 && !carry1(a, b));
group('A<10,B<10 with carry', (a, b) => a < 10 && b < 10 && carry1(a, b));

console.log('\n--- tens-digit pair (ta,tb): error % on unseen (rows ta, cols tb; A,B < 100) ---');
console.log('      ' + [...Array(10).keys()].map(x => `tb=${x}`.padStart(7)).join(''));
for (let ta = 0; ta < 10; ta++) {
  let row = `ta=${ta} `;
  for (let tb = 0; tb < 10; tb++) {
    let t = 0, w = 0;
    for (let a = ta * 10; a < ta * 10 + 10; a++) for (let b = tb * 10; b < tb * 10 + 10; b++) { t += tested[a * N + b]; w += wrong[a * N + b]; }
    row += (100 * w / t).toFixed(1).padStart(7);
  }
  console.log(row);
}

console.log('\n--- most error-prone sums ---');
const worst = [];
for (let k = 0; k < N * N; k++) if (tested[k] >= RUNS / 2) worst.push([wrong[k] / tested[k], Math.floor(k / N), k % N, tested[k]]);
worst.sort((x, y) => y[0] - x[0]);
console.log(worst.slice(0, 25).map(([e, a, b, t]) => `${a}+${b}=${a + b} ${(e * 100).toFixed(0)}%`).join(',  '));
