# A neural network learns to add

A browser demo of supervised learning. A small neural network studies worked
examples of `A + B = C` (A and B from 0 to 100), then is quizzed on sums it has
never seen. The network is drawn live: layers light up as the signal flows
forward, and a pink backpropagation wave flows back while it trains.

**Run it:** open `index.html` in a browser. No server, no install, no libraries.
Everything (network, training, drawing) is plain JavaScript.

## The network

```
input 44  →  hidden 48  →  hidden 32  →  hidden 24  →  output 23
(one-hot)     (ReLU)        (ReLU)        (ReLU)       (3 softmax heads)
```

| Layer | Nodes | Why |
|---|---|---|
| Input | 44 | Each digit of A and B is one-hot: A hundreds (2), A tens (10), A ones (10), and the same for B. Addition works column by column, so digits are the natural input. |
| Hidden 1–3 | 48, 32, 24 | The ones digit is easy (it only needs the two ones digits). The tens digit needs the tens digits **and** the carry from the ones column, which takes depth. |
| Output | 23 | Classification of each digit of C: hundreds (0–2), tens (0–9), ones (0–9). Each head is its own softmax, so the model gives a probability for every digit. |

Training: mini-batches of 32, Adam, learning rate eased 0.005 → 0.0003 (cosine)
over 60 epochs, weight decay 0.001. 5,095 weights and biases in total.

Measured on 7,201 unseen sums (3,000 training sums, `tools/compare-architectures.js`):

| Hidden layers | Unseen sums correct |
|---|---|
| 64 (one layer) | ~80–84%, nearly all misses in the tens digit |
| 32 → 24 → 16 | ~98–99.5% |
| **48 → 32 → 24** | **~98–99.8%** (varies with the random training set) |

## Training and test data

There are 101 × 101 = 10,201 possible sums. The training set is built so that it covers:

- every A from 0 to 100 and every B from 0 to 100 (each several times)
- every answer C from 0 to 200
- all 100 ones-digit pairs (so every carry case of the ones column)
- all 100 tens-digit pairs, both with and without an incoming carry
- **rare patterns at 1.5× the normal density** (see below)

It is then topped up with random sums to the chosen size (default 3,000). **Every
sum not in the training set is a test sum**, so a test is always a question the
network has never seen.

### Why rare patterns get extra examples

With purely random training sums, the errors on unseen sums cluster in two
corners and two lines of the map (`tools/edge-analysis.js`):

- **Corners: extreme tens-column totals.** The tens column adds tens of A + tens of B
  + carry (0 to 19). Like two dice, a middle total can be made from up to 10 digit
  pairs, but totals 0–1 only from 0+0 and 18–19 only from 9+9. The network has far
  less evidence for them, so sums like 7+3, 9+1 and 91+99 are the most-missed.
- **Lines: A = 100 and B = 100.** These are the only sums that switch on the
  "hundreds = 1" input node, about 2% of the training set.

So the training set studies those groups (tens totals 0–2 and 17–19, and the two
100 lines) at 1.5× the average density, capped at 60% so part of each group is
always left for testing. Same total number of training sums
(16 runs each, `tools/edge-experiments.js`):

| 3,000 training sums | 100 lines | Corners | Rest | Overall |
|---|---|---|---|---|
| Purely random | 10.6% | 1.65% | 0.03% | 0.38% |
| **Rare patterns 1.5×** | **0.9%** | **0.80%** | 0.07% | **0.12%** |

Boosting harder (2×, 3×) starts to starve the rest of the map when the training
set is small. A bigger network also helps, but fixing the data is the real cure.

## Predictions are probabilities

The answer probability is the product of the three digit heads:
`P(C = 132) = P(hundreds = 1) × P(tens = 3) × P(ones = 2)`. All 300 combinations
are scored and the top 5 are shown, so you can see how sure (or unsure) the model is.

## Files

| File | What it does |
|---|---|
| `nn.js` | The network (forward, backprop, Adam), digit encoding, dataset builder, top-5 answers |
| `viz.js` | Canvas drawing and animation of the network |
| `charts.js` | Learning curves, coverage strips, the map of all 10,201 sums |
| `app.js` | UI wiring and the training loop |
| `tools/check.js` | `node tools/check.js`: gradient check, coverage check, full training run |
| `tools/compare-architectures.js` | Compare hidden-layer shapes |
