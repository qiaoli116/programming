// Compares hidden-layer shapes on the addition task.
// Usage: node tools/compare-architectures.js [trainCount] [epochs] [lr] [shapes-json]
const NN = require('../nn.js');

const trainCount = Number(process.argv[2] || 2000);
const epochs = Number(process.argv[3] || 60);
const lr = Number(process.argv[4] || 0.003);
const wd = Number(process.env.WD || 1e-4);
const shapes = process.argv[5] ? JSON.parse(process.argv[5])
  : [[32, 24, 16], [32, 32, 16], [48, 32, 16], [32, 32, 32], [48, 32, 24]];

const data = NN.makeDataset(trainCount, 42);
const cov = data.coverage;
console.log(`train ${data.train.length} (required for coverage: ${data.required})  test ${data.test.length}`);
console.log(`min count  A ${Math.min(...cov.countA)}  B ${Math.min(...cov.countB)}  C ${Math.min(...cov.countC)}`);

for (const hidden of shapes) {
  for (const seed of [1, 2, 3]) {
    const net = new NN.Network([NN.INPUT_SIZE, ...hidden, NN.OUTPUT_SIZE], seed);
    const idx = data.trainEnc.x.map((_, i) => i);
    const rand = NN.makeRng(seed + 99);
    const t0 = Date.now();
    let reached = null;
    for (let e = 1; e <= epochs; e++) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (let s = 0; s < idx.length; s += 32) net.trainBatch(data.trainEnc, idx.slice(s, s + 32), lr, wd);
      if (reached === null && e % 2 === 0 && net.accuracy(data.testEnc).exact >= 0.99) reached = e;
    }
    const tr = net.accuracy(data.trainEnc), te = net.accuracy(data.testEnc);
    console.log(`${JSON.stringify(hidden).padEnd(12)} seed ${seed}  params ${String(net.paramCount).padStart(5)}  ` +
      `train ${(tr.exact * 100).toFixed(1)}%  test ${(te.exact * 100).toFixed(1)}%  heads ${te.heads.map(h => (h * 100).toFixed(0)).join('/')}  ` +
      `99% at epoch ${reached ?? '-'}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
