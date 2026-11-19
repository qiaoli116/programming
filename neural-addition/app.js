/*
 * app.js — wires the data, training loop, network picture and test panel together.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmtInt = n => n.toLocaleString('en-US');
  const pct1 = p => (p >= 0.9995 ? '100' : (p * 100).toFixed(1)) + '%';
  const candPct = p => p >= 0.9995 ? '>99.9%' : p < 0.001 ? '<0.1%' : (p * 100).toFixed(1) + '%';

  const PRESETS = {
    rec: [48, 32, 24],
    small: [32, 24, 16],
    even: [32, 32, 32],
    shallow: [64],
  };
  const EPOCHS = 60, BATCH = 32, LR_MAX = 0.005, LR_MIN = 0.0003, WD = 1e-3;
  const SPEEDS = { slow: { batches: 1 }, normal: { batches: 5 }, fast: { budgetMs: 12 } };
  const N = NN.MAX + 1;

  const S = {
    seed: 42, netSeed: 1,
    data: null, net: null,
    epoch: 0, pos: 0, order: null,
    running: false, done: false,
    history: [], pred: new Int16Array(N * N), lastEval: null,
    epochLoss: 0, epochN: 0, batchLoss: null, lr: LR_MAX,
    speed: 'normal', watch: true, autoplay: false,
    testing: false, autoTimer: null,
    weightsChanged: false, lastWeightsDraw: 0,
  };

  // ---------- components ----------
  const viz = new NetworkViz($('net'));
  const lossChart = new Charts.LineChart($('chartLoss'),
    [{ key: 'loss', name: 'Loss', color: '#b48cff' }],
    { xMax: EPOCHS, yFormat: v => v === 0 ? '0' : v.toFixed(1) });
  const accChart = new Charts.LineChart($('chartAcc'),
    [{ key: 'train', name: 'Training set', color: '#9b6bf2' }, { key: 'test', name: 'Unseen test', color: '#1aa595' }],
    { xMax: EPOCHS, yMax: 1, yFormat: v => Math.round(v * 100) + '%' });
  const strips = {
    A: new Charts.CoverageStrip($('stripA'), 'A'),
    B: new Charts.CoverageStrip($('stripB'), 'B'),
    C: new Charts.CoverageStrip($('stripC'), 'C'),
  };
  const map = new Charts.EquationMap($('map'), (a, b) => { setOperands(a, b); predict(); });

  // ---------- data ----------
  function buildData() {
    const want = +$('trainCount').value;
    S.data = NN.makeDataset(want, S.seed);
    const d = S.data, nTrain = d.train.length, nTest = d.test.length;
    $('trainCountOut').textContent = fmtInt(nTrain);
    $('splitBar').style.width = (100 * nTrain / (N * N)) + '%';
    $('splitText').innerHTML = `<b>${fmtInt(nTrain)}</b> to study (${Math.round(100 * nTrain / (N * N))}%) · <b>${fmtInt(nTest)}</b> held back as unseen test sums`;

    const c = d.coverage, pc = NN.patternCoverage(d.train);
    const minA = Math.min(...c.countA), minB = Math.min(...c.countB), minC = Math.min(...c.countC);
    const items = [
      [minA > 0, 'Every A, 0 to 100', `each ≥ ${minA}×`],
      [minB > 0, 'Every B, 0 to 100', `each ≥ ${minB}×`],
      [minC > 0, 'Every answer C, 0 to 200', `each ≥ ${minC}×`],
      [pc.onesPairs === 100, 'Every ones-digit pair', `${pc.onesPairs}/100`],
      [pc.tensCases === 200, 'Every tens pair, ± carry', `${pc.tensCases}/200`],
    ];
    $('coverageList').innerHTML = items.map(([ok, text, n]) =>
      `<li><span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</span>${text}<small>${n}</small></li>`).join('');
    strips.A.setCounts(c.countA);
    strips.B.setCounts(c.countB);
    strips.C.setCounts(c.countC);
    $('eqSummary').textContent = `Browse the ${fmtInt(nTrain)} training equations`;
    if ($('eqDetails').open) renderEqList(); else $('eqList').innerHTML = '';
    resetNetwork();
  }

  function renderEqList() {
    const d = S.data;
    const rows = d.train.map(([a, b], k) => {
      const why = d.reason.get(a + ',' + b);
      return `<div><span>${a} + ${b} = ${a + b}</span><em class="${k < d.required ? 'req' : ''}">${why}</em></div>`;
    });
    $('eqList').innerHTML = `<div><span style="color:var(--muted)">first ${d.required} chosen for coverage, the rest random</span></div>` + rows.join('');
  }

  // ---------- network / training ----------
  function resetNetwork() {
    stopAutoplay();
    S.running = false; S.done = false;
    S.epoch = 0; S.pos = 0; S.history = [];
    S.epochLoss = 0; S.epochN = 0; S.batchLoss = null; S.lr = LR_MAX;
    const hidden = PRESETS[$('arch').value];
    S.net = new NN.Network([NN.INPUT_SIZE, ...hidden, NN.OUTPUT_SIZE], S.netSeed++);
    S.order = Int32Array.from(S.data.train.keys());
    $('archDesc').textContent = `${S.net.sizes.join(' → ')}  ·  ${fmtInt(S.net.paramCount)} weights and biases to learn`;
    viz.setNetwork(S.net);
    viz.caption = 'This network is untrained: its weights are random, so its answers are guesses.';
    viz.subcaption = 'Press ▶ Train to start learning, or Predict to watch it guess.';
    const ev = evaluate();
    S.history.push({ x: 0, loss: meanLoss(), train: ev.train, test: ev.test });
    S.testing = false;
    clearResult();
    updateTrainUI();
    refreshCharts();
  }

  const lrAt = e => LR_MIN + (LR_MAX - LR_MIN) * 0.5 * (1 + Math.cos(Math.PI * Math.min(e, EPOCHS) / EPOCHS));

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  }

  function trainSlice() {
    if (!S.running) return;
    const n = S.data.train.length, sp = SPEEDS[S.speed], t0 = performance.now();
    let batches = 0;
    while (S.running) {
      if (sp.batches && batches >= sp.batches) break;
      if (sp.budgetMs && performance.now() - t0 > sp.budgetMs) break;
      if (S.pos === 0) shuffle(S.order);
      const end = Math.min(n, S.pos + BATCH);
      S.lr = lrAt(S.epoch + S.pos / n);
      const loss = S.net.trainBatch(S.data.trainEnc, S.order.subarray(S.pos, end), S.lr, WD);
      S.epochLoss += loss * (end - S.pos); S.epochN += end - S.pos; S.batchLoss = loss;
      S.pos = end; batches++;
      if (S.pos >= n) {
        S.pos = 0; S.epoch++;
        onEpochEnd();
        if (S.epoch >= EPOCHS) { finishTraining(); break; }
      }
    }
    if (batches) S.weightsChanged = true;
  }

  /** Predict every one of the 10,201 sums. */
  function evaluate() {
    const net = S.net, isTrain = S.data.isTrain, pred = S.pred, x = new Float32Array(NN.INPUT_SIZE);
    let trOk = 0, trN = 0, teOk = 0, teN = 0;
    const heads = [0, 0, 0];
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      NN.encodeInput(a, b, x);
      net.forward(x);
      const d = net.argmaxHeads(), v = d[0] * 100 + d[1] * 10 + d[2], k = a * N + b;
      pred[k] = v;
      const ok = v === a + b;
      if (isTrain[k]) { trN++; if (ok) trOk++; }
      else {
        teN++; if (ok) teOk++;
        const y = NN.targetDigits(a, b);
        for (let h = 0; h < 3; h++) if (d[h] === y[h]) heads[h]++;
      }
    }
    S.lastEval = { train: trOk / trN, test: teOk / teN, testWrong: teN - teOk, testN: teN, heads: heads.map(h => h / teN) };
    map.set(isTrain, pred);
    return S.lastEval;
  }

  function meanLoss() {
    const enc = S.data.trainEnc, net = S.net;
    let s = 0;
    for (let i = 0; i < enc.x.length; i++) {
      const out = net.forward(enc.x[i]);
      NN.OUTPUT_HEADS.forEach((h, hi) => { s -= Math.log(Math.max(1e-12, out[h.offset + enc.y[i][hi]])); });
    }
    return s / enc.x.length;
  }

  function onEpochEnd() {
    const ev = evaluate();
    S.history.push({ x: S.epoch, loss: S.epochLoss / Math.max(1, S.epochN), train: ev.train, test: ev.test });
    S.epochLoss = 0; S.epochN = 0;
    refreshCharts();
    updateTrainUI();
  }

  function finishTraining() {
    S.running = false; S.done = true;
    const ev = S.lastEval;
    viz.caption = `Training complete: ${pct1(ev.test)} of ${fmtInt(ev.testN)} never-seen sums answered exactly right.`;
    viz.subcaption = 'Now quiz it in step 3: try any sum, or use 🎲 Random unseen.';
    updateTrainUI();
    if (!S.testing) setTimeout(() => { if (!S.running && !S.testing) randomUnseen(); }, 900);
  }

  function toggleTraining() {
    if (S.done) return;
    S.running = !S.running;
    if (S.running) {
      viz.caption = 'Training…';
      viz.subcaption = '';
      // bring the learning curves into view
      const side = document.querySelector('.side.left'), card = $('cardTrain');
      if (side.scrollHeight > side.clientHeight) side.scrollTo({ top: card.offsetTop - side.offsetTop - 8, behavior: 'smooth' });
    } else {
      viz.caption = `Paused at epoch ${S.epoch}.`;
      viz.subcaption = 'Press ▶ Train to continue, or test it now to see what it has learned so far.';
    }
    updateTrainUI();
  }

  function playTrainingSample() {
    const k = Math.floor(Math.random() * S.data.train.length);
    const [a, b] = S.data.train[k];
    const tr = S.net.trace(a, b);
    const v = tr.digits[0] * 100 + tr.digits[1] * 10 + tr.digits[2];
    viz.play(tr, S.speed === 'fast' ? 'fast' : 'train');
    viz.caption = `Studying ${a} + ${b} = ${a + b}  ·  network guessed ${v} ${v === a + b ? '✓' : '✗'}  ·  loss ${tr.loss.toFixed(2)}`;
    viz.subcaption = 'Violet = forward pass (the guess)  ·  Pink = backpropagation (the error flows back and every weight is nudged)';
  }

  function updateTrainUI() {
    const steps = document.querySelectorAll('#steps li');
    const stage = S.done || S.testing && S.epoch > 0 ? 3 : (S.running || S.epoch > 0 ? 2 : 1);
    steps.forEach(li => {
      const n = +li.dataset.step;
      li.classList.toggle('on', n === stage);
      li.classList.toggle('done', n < stage);
    });
    const btn = $('btnTrain');
    btn.textContent = S.done ? '✓ Trained' : S.running ? '⏸ Pause' : S.epoch > 0 ? '▶ Resume' : '▶ Train';
    btn.disabled = S.done;
    const frac = (S.epoch + S.pos / S.data.train.length) / EPOCHS;
    $('progBar').style.width = (100 * Math.min(1, frac)) + '%';
    $('progText').textContent = `Epoch ${S.epoch} / ${EPOCHS}` +
      (S.batchLoss != null ? `  ·  learning rate ${S.lr.toFixed(4)}  ·  batch loss ${S.batchLoss.toFixed(3)}` : '  ·  one epoch = one pass over every training equation');
    const ev = S.lastEval;
    $('accTrain').textContent = ev ? pct1(ev.train) : '–';
    $('accTest').textContent = ev ? pct1(ev.test) : '–';
    $('accTestSub').textContent = ev ? `${fmtInt(ev.testWrong)} of ${fmtInt(ev.testN)} wrong` : 'exactly right';
    $('headAcc').innerHTML = ev ? `Unseen, per digit: <span>hundreds <b>${pct1(ev.heads[0])}</b></span><span>tens <b>${pct1(ev.heads[1])}</b></span><span>ones <b>${pct1(ev.heads[2])}</b></span>` : '';
  }

  function refreshCharts() {
    lossChart.setData(S.history.map(h => ({ x: h.x, loss: h.loss })));
    accChart.setData(S.history.map(h => ({ x: h.x, train: h.train, test: h.test })));
  }

  // ---------- testing ----------
  function clampInt(v) { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(0, Math.min(NN.MAX, v)) : 0; }
  function setOperands(a, b) {
    $('inA').value = $('rngA').value = a;
    $('inB').value = $('rngB').value = b;
  }

  function predict() {
    const a = clampInt($('inA').value), b = clampInt($('inB').value);
    setOperands(a, b);
    const seen = !!S.data.isTrain[a * N + b];
    const tr = S.net.trace(a, b);
    S.testing = true;
    map.select(a, b);
    $('result').innerHTML = `<div class="eq">${a} + ${b} = <span class="ans wait">?</span></div>` +
      `<div class="badges">${seenBadge(seen)}</div>`;
    $('cands').innerHTML = '<div class="empty">Thinking… the signal is travelling through the layers.</div>';
    $('explain').hidden = true;
    viz.caption = `Test: ${a} + ${b}  ·  ${seen ? 'this sum was in the training set' : 'the network has NEVER seen this sum'}`;
    viz.subcaption = 'Forward pass only: testing does not change any weights';
    viz.play(tr, 'test', {
      onOutput: () => showResult(a, b, tr, seen),
      onDone: () => {
        S.testing = false;
        updateTrainUI();
        if (S.autoplay) S.autoTimer = setTimeout(() => { if (S.autoplay) randomUnseen(); }, 1500);
      },
    });
    updateTrainUI();
  }

  function seenBadge(seen) {
    return seen ? '<span class="badge seen">Studied in training</span>' : '<span class="badge unseen">Never seen in training</span>';
  }

  function randomUnseen() {
    clearTimeout(S.autoTimer);
    const t = S.data.test;
    const [a, b] = t[Math.floor(Math.random() * t.length)];
    setOperands(a, b);
    predict();
  }

  function stopAutoplay() {
    S.autoplay = false;
    $('autoplay').checked = false;
    clearTimeout(S.autoTimer);
  }

  function showResult(a, b, tr, seen) {
    const probs = tr.acts[tr.acts.length - 1];
    const top = NN.topCandidates(probs, 5);
    const best = top[0], truth = a + b, ok = best.value === truth;
    $('result').innerHTML = `<div class="eq">${a} + ${b} = <span class="ans">${best.value}</span></div>` +
      `<div class="badges">${seenBadge(seen)}<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? '✓ Correct' : `✗ Wrong: true answer is ${truth}`}</span></div>`;
    const shown = top.reduce((s, c) => s + c.p, 0);
    const rows = top.map((c, k) => `
      <div class="cand${k === 0 ? ' first' : ''}">
        <span class="v">${c.value}</span>
        <div class="bar"><i style="width:0%" data-w="${(c.p * 100).toFixed(2)}"></i></div>
        <span class="p">${candPct(c.p)}</span>
        ${c.value === truth ? '<span class="truth">↑ the true answer</span>' : ''}
      </div>`).join('');
    const truthInTop = top.some(c => c.value === truth);
    const rest = Math.max(0, 1 - shown);
    $('cands').innerHTML = rows +
      `<div class="cand rest"><span class="v">other</span><div class="bar"><i style="width:0%" data-w="${(rest * 100).toFixed(2)}"></i></div><span class="p">${candPct(rest)}</span></div>` +
      (truthInTop ? '' : `<div class="hint small" style="margin:6px 0 0">The true answer ${truth} is not even in its top 5.</div>`);
    requestAnimationFrame(() => document.querySelectorAll('#cands .bar i').forEach(i => { i.style.width = Math.max(0.6, +i.dataset.w) + '%'; }));
    const [ph, pt, po] = best.parts, [h, t, o] = best.digits;
    $('explain').hidden = false;
    $('explain').innerHTML = `<b>Where ${candPct(best.p)} comes from:</b> the network has three digit heads, each giving a probability for every digit. ` +
      `P(hundreds = ${h}) <b>${candPct(ph)}</b> × P(tens = ${t}) <b>${candPct(pt)}</b> × P(ones = ${o}) <b>${candPct(po)}</b> = <b>${candPct(best.p)}</b>. ` +
      `Every one of the 300 digit combinations gets a probability like this; the list shows the five largest.`;
  }

  function clearResult() {
    $('result').innerHTML = '<div class="empty">Press Predict to send a question through the network.</div>';
    $('cands').innerHTML = '<div class="empty">An AI answer is a probability, not a certainty. After a prediction you will see its five most likely answers here.</div>';
    $('explain').hidden = true;
  }

  // ---------- main loop ----------
  function frame(now) {
    trainSlice();
    if (S.running && S.watch && !S.testing && !viz.isPlaying()) playTrainingSample();
    if (S.running && !S.watch && !S.testing) {
      viz.caption = `Training… epoch ${S.epoch + 1} of ${EPOCHS}`;
      viz.subcaption = 'Animation off: training at full speed';
    }
    if (S.weightsChanged && now - S.lastWeightsDraw > 250) {
      viz.markWeightsDirty();
      S.weightsChanged = false;
      S.lastWeightsDraw = now;
    }
    if (S.running) updateTrainUI();
    viz.draw(now);
    requestAnimationFrame(frame);
  }

  // ---------- events ----------
  $('trainCount').addEventListener('input', () => { $('trainCountOut').textContent = fmtInt(+$('trainCount').value); });
  $('trainCount').addEventListener('change', buildData);
  $('btnNewData').addEventListener('click', () => { S.seed = Math.floor(Math.random() * 1e9); buildData(); });
  $('eqDetails').addEventListener('toggle', () => { if ($('eqDetails').open) renderEqList(); });
  $('arch').addEventListener('change', resetNetwork);
  $('btnTrain').addEventListener('click', toggleTraining);
  $('btnReset').addEventListener('click', resetNetwork);
  $('speed').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S.speed = b.dataset.speed;
    document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('watch').addEventListener('change', () => { S.watch = $('watch').checked; });
  $('btnPredict').addEventListener('click', () => { clearTimeout(S.autoTimer); predict(); });
  $('btnRandom').addEventListener('click', randomUnseen);
  $('autoplay').addEventListener('change', () => {
    S.autoplay = $('autoplay').checked;
    if (S.autoplay && !S.testing) randomUnseen();
    if (!S.autoplay) clearTimeout(S.autoTimer);
  });
  for (const k of ['A', 'B']) {
    $('rng' + k).addEventListener('input', () => { $('in' + k).value = $('rng' + k).value; });
    $('in' + k).addEventListener('input', () => { $('rng' + k).value = clampInt($('in' + k).value); });
    $('in' + k).addEventListener('keydown', e => { if (e.key === 'Enter') predict(); });
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      viz.resize();
      lossChart.draw(); accChart.draw(); map.draw();
      Object.values(strips).forEach(s => s.draw());
    }, 80);
  });

  // ---------- start ----------
  buildData();
  requestAnimationFrame(frame);
  setTimeout(() => { if (!S.running && !S.testing) predict(); }, 700);

  // handy for poking around in the console
  window.app = { S, viz, predict, randomUnseen, toggleTraining };
})();
