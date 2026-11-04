// Turns the raw results of one verification run into a stand-alone HTML test result, and keeps the
// index page of all runs up to date. Used by run.ts; `npm run verify -- --render <raw.json>` re-renders a saved run.
import fs from 'node:fs';
import path from 'node:path';

export type Level = 'Unit/API' | 'Browser';
export interface PlanItem { id: string; group: string; text: string; levels: Level[] }
export interface Run {
  title: string;
  level: Level;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  review?: string;
  images: { name: string; data: string }[];
  texts: { name: string; text: string }[];
}
export interface Raw {
  stamp: string; // 20261030-143502
  startedAt: string;
  durationMs: number;
  build: { commit: string; dirty: boolean; node: string };
  settings: { slowMo: number; cdp: string };
  /** Which iteration's test plan this run follows (1 when missing). */
  iteration?: number;
  plan: PlanItem[];
  runs: Run[];
  /** ids of tests that carry a plan id, per run, are found by the pattern below */
}
export type Notes = Record<string, { status?: Status; note?: string }>;
export type Status = 'pass' | 'fail' | 'review' | 'incomplete' | 'notrun';

export const ID = /\b(TC-\d\d-\d+|SEC-\d+|MC2?-\d)\b/g;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LABEL: Record<Status, string> = { pass: 'Pass', fail: 'Fail', review: 'Needs review', incomplete: 'Incomplete', notrun: 'Not run' };

export function runsFor(raw: Raw, id: string): Run[] {
  return raw.runs.filter((r) => [...r.title.matchAll(ID)].some((m) => m[1] === id));
}

export function statusOf(raw: Raw, item: PlanItem, notes: Notes): Status {
  const override = notes[item.id]?.status;
  if (override) return override;
  const runs = runsFor(raw, item.id);
  if (!runs.length) return 'notrun';
  if (runs.some((r) => r.status === 'failed')) return 'fail';
  if (runs.some((r) => r.review)) return 'review';
  const done = new Set(runs.filter((r) => r.status === 'passed').map((r) => r.level));
  return item.levels.every((l) => done.has(l)) ? 'pass' : 'incomplete';
}

const CSS = `
:root{--ink:#101828;--mute:#667085;--line:#e4e7ec;--bg:#f9fafb;--pass:#067647;--passbg:#ecfdf3;--fail:#b42318;--failbg:#fef3f2;--warn:#b54708;--warnbg:#fffaeb}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:1050px;margin:0 auto;padding:24px 16px 64px}h1{margin:0 0 4px;font-size:26px}h2{margin:32px 0 8px;font-size:19px}h3{margin:20px 0 6px;font-size:16px}
.sub{color:var(--mute);margin:0 0 16px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:16px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 14px}.card b{display:block;font-size:26px}.card span{color:var(--mute);font-size:13px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:14px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:#f2f4f7;font-size:13px}tr:last-child td{border-bottom:0}
.wrap{overflow-x:auto}.id{font-family:ui-monospace,Consolas,monospace;font-weight:600;white-space:nowrap}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;font-size:12.5px;font-weight:600;white-space:nowrap}
.pass{background:var(--passbg);color:var(--pass)}.fail{background:var(--failbg);color:var(--fail)}.review,.incomplete{background:var(--warnbg);color:var(--warn)}.notrun{background:#f2f4f7;color:var(--mute)}
.small{font-size:13px;color:var(--mute)}.note{background:#fff;border-left:4px solid var(--warn);padding:6px 10px;margin:6px 0;font-size:13.5px}
pre{background:#101828;color:#f2f4f7;padding:10px 12px;border-radius:6px;overflow-x:auto;font-size:12.5px;white-space:pre-wrap}
details{margin:6px 0}summary{cursor:pointer;color:#175cd3}.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin-top:8px}
.shots figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:6px;padding:6px}.shots img{max-width:100%;display:block}.shots figcaption{font-size:12.5px;color:var(--mute);margin-top:4px}
a{color:#175cd3}`;

export function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function fileNameFor(raw: Raw) {
  return `test-result-${raw.stamp}.html`;
}

function imagesHtml(runs: Run[]) {
  const imgs = runs.flatMap((r) => r.images);
  if (!imgs.length) return '';
  return `<div class="shots">${imgs
    .map((i) => `<figure><a href="data:image/png;base64,${i.data}" target="_blank"><img loading="lazy" alt="${esc(i.name)}" src="data:image/png;base64,${i.data}"></a><figcaption>${esc(i.name)}</figcaption></figure>`)
    .join('')}</div>`;
}

function detailsHtml(raw: Raw, items: PlanItem[], notes: Notes) {
  const out: string[] = [];
  for (const item of items) {
    const st = statusOf(raw, item, notes);
    const runs = runsFor(raw, item.id);
    const failed = runs.filter((r) => r.status === 'failed');
    const note = notes[item.id]?.note;
    const hasEvidence = failed.length || runs.some((r) => r.review || r.texts.length) || note;
    if (!hasEvidence && st !== 'notrun' && st !== 'incomplete') continue;
    out.push(`<h3><span class="id">${item.id}</span> ${esc(item.text)} <span class="pill ${st}">${LABEL[st]}</span></h3>`);
    if (note) out.push(`<div class="note">${esc(note)}</div>`);
    if (st === 'notrun') out.push('<p class="small">No test with this id ran.</p>');
    if (st === 'incomplete') {
      const done = new Set(runs.map((r) => r.level));
      out.push(`<p class="small">Planned levels not run: ${item.levels.filter((l) => !done.has(l)).join(', ')}.</p>`);
    }
    for (const r of failed) out.push(`<p><b>${esc(r.level)}:</b> ${esc(r.title)}</p><pre>${esc(r.error ?? 'Failed (no message)')}</pre>`);
    for (const r of runs) for (const t of r.texts) out.push(`<details><summary>${esc(t.name)}</summary><pre>${esc(t.text)}</pre></details>`);
    for (const r of runs) if (r.review) out.push(`<div class="note">${esc(r.review)}</div>`);
    out.push(imagesHtml(runs));
  }
  return out.join('\n');
}

export function render(raw: Raw, notes: Notes = {}): string {
  const group = (name: string) => raw.plan.filter((p) => p.group === name);
  const groups = [...new Set(raw.plan.map((p) => p.group))];
  const status = new Map(raw.plan.map((p) => [p.id, statusOf(raw, p, notes)]));
  const count = (s: Status, ids = raw.plan) => ids.filter((p) => status.get(p.id) === s).length;
  const cases = raw.plan.filter((p) => p.id.startsWith('TC-'));
  const sec = raw.plan.filter((p) => p.id.startsWith('SEC-'));
  const mc = raw.plan.filter((p) => p.id.startsWith('MC-') || p.id.startsWith('MC2-'));
  const allPass = (ids: PlanItem[]) => ids.every((p) => status.get(p.id) === 'pass');
  const total = raw.plan.length;
  const failedN = count('fail');
  const verdict = failedN
    ? `${failedN} of ${total} plan items failed`
    : count('pass') === total
      ? 'All plan items passed'
      : `No failures, but ${total - count('pass')} item(s) still need attention`;
  const started = new Date(raw.startedAt);
  const others = raw.runs.filter((r) => ![...r.title.matchAll(ID)].length);

  const summary = {
    stamp: raw.stamp, startedAt: raw.startedAt, durationMs: raw.durationMs, commit: raw.build.commit,
    total, pass: count('pass'), fail: failedN, other: total - count('pass') - failedN, verdict,
  };

  const rowHtml = (p: PlanItem) => {
    const st = status.get(p.id)!;
    const runs = runsFor(raw, p.id);
    const how = runs.length ? runs.map((r) => `${r.level}${r.status === 'failed' ? ' ✗' : r.status === 'passed' ? ' ✓' : ''}`).join(', ') : '—';
    const ms = runs.reduce((a, r) => a + r.durationMs, 0);
    return `<tr><td class="id">${p.id}</td><td>${esc(p.text)}</td><td class="small">${how}</td><td class="small">${(ms / 1000).toFixed(1)} s</td><td><span class="pill ${st}">${LABEL[st]}</span></td></tr>`;
  };
  const table = (items: PlanItem[]) =>
    `<div class="wrap"><table><thead><tr><th>Id</th><th>Test case</th><th>Checked by</th><th>Time</th><th>Result</th></tr></thead><tbody>${items.map(rowHtml).join('')}</tbody></table></div>`;

  const crit = (ok: boolean, text: string) => `<tr><td><span class="pill ${ok ? 'pass' : 'fail'}">${ok ? 'Met' : 'Not met'}</span></td><td>${text}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test result ${raw.stamp} – Job board iteration ${raw.iteration ?? 1}</title>
<style>${CSS}</style>
<script type="application/json" id="run-summary">${JSON.stringify(summary)}</script></head>
<body><main>
<p class="small"><a href="index.html">← All test runs</a> · <a href="../test-plan/test-plan.html">Test plan</a> · <a href="../../process.html#i1-stage4">Process document, Stage 4</a></p>
<h1>Test result – ${started.toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'medium' })}</h1>
<p class="sub">${esc(verdict)}. Job board iteration ${raw.iteration ?? 1}, run according to the test plan (Stage 4 – Testing).</p>
<div class="cards">
  <div class="card"><b>${total}</b><span>plan items</span></div>
  <div class="card"><b style="color:var(--pass)">${count('pass')}</b><span>passed</span></div>
  <div class="card"><b style="color:var(--fail)">${failedN}</b><span>failed</span></div>
  <div class="card"><b style="color:var(--warn)">${count('review') + count('incomplete')}</b><span>need review / incomplete</span></div>
  <div class="card"><b>${count('notrun')}</b><span>not run</span></div>
</div>
<table><tbody>
  <tr><th>Run started</th><td>${started.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'medium' })} (file name time ${raw.stamp})</td></tr>
  <tr><th>Duration</th><td>${Math.round(raw.durationMs / 1000)} s</td></tr>
  <tr><th>Build</th><td>git <code>${esc(raw.build.commit)}</code>${raw.build.dirty ? ' + uncommitted changes' : ''}, Node ${esc(raw.build.node)}</td></tr>
  <tr><th>How it was run</th><td>Unit and API tests (Vitest) on an in-memory database. Browser tests and manual checklist (Playwright) in a visible Chrome at human speed (${raw.settings.slowMo} ms pause before every action), each test starting from freshly seeded data (6 employers, 8 seekers, 30 jobs, 45 applications).</td></tr>
</tbody></table>

<h2>Exit criteria (test plan section 5)</h2>
<table><tbody>
${crit(allPass(cases), `Every test case in section 6 passes (${count('pass', cases)} of ${cases.length})`)}
${crit(allPass(sec), `Every test in section 7 passes (${count('pass', sec)} of ${sec.length})`)}
${crit(allPass(mc), `The manual checklist is completed (${count('pass', mc)} of ${mc.length} passed)`)}
<tr><td><span class="pill review">Judge</span></td><td>No known bug blocks a use case – decided by a person after reading the failures below</td></tr>
</tbody></table>

${groups.map((g) => `<h2>${esc(g)}</h2>${table(group(g))}`).join('\n')}
${others.length ? `<h2>Other tests (not in the plan)</h2><div class="wrap"><table><thead><tr><th>Test</th><th>Level</th><th>Result</th></tr></thead><tbody>${others.map((r) => `<tr><td>${esc(r.title)}</td><td class="small">${r.level}</td><td><span class="pill ${r.status === 'passed' ? 'pass' : r.status === 'failed' ? 'fail' : 'notrun'}">${r.status === 'passed' ? 'Pass' : r.status === 'failed' ? 'Fail' : 'Skipped'}</span></td></tr>`).join('')}</tbody></table></div>` : ''}

<h2>Findings and evidence</h2>
${detailsHtml(raw, raw.plan, notes) || '<p class="small">Nothing to report.</p>'}
</main></body></html>
`;
}

export function writeReport(dir: string, raw: Raw, notes: Notes = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileNameFor(raw));
  fs.writeFileSync(file, render(raw, notes), 'utf8');
  writeIndex(dir);
  return file;
}

/** index.html lists every test-result-*.html in the folder, newest first. */
export function writeIndex(dir: string) {
  const runs = fs
    .readdirSync(dir)
    .filter((f) => /^test-result-\d{8}-\d{6}\.html$/.test(f))
    .sort()
    .reverse()
    .map((f) => {
      const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/id="run-summary">(.*?)<\/script>/);
      return { f, s: m ? (JSON.parse(m[1]) as Record<string, any>) : null };
    });
  const rows = runs
    .map(({ f, s }) =>
      s
        ? `<tr><td><a href="${f}">${new Date(s.startedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'medium' })}</a></td><td><span class="pill ${s.fail ? 'fail' : s.other ? 'review' : 'pass'}">${esc(s.verdict)}</span></td><td>${s.pass} / ${s.total}</td><td>${s.fail}</td><td class="small">${Math.round(s.durationMs / 1000)} s</td><td class="small"><code>${esc(s.commit)}</code></td></tr>`
        : `<tr><td colspan="6"><a href="${f}">${f}</a></td></tr>`,
    )
    .join('');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test runs – Job board iteration ${/iteration-(\d+)/.exec(dir)?.[1] ?? 1}</title><style>${CSS}</style></head><body><main>
<p class="small"><a href="../test-plan/test-plan.html">Test plan</a> · <a href="../../process.html#i1-stage4">Process document, Stage 4</a></p>
<h1>Test runs</h1><p class="sub">One file per run of the whole test plan, named with the time the run started. Newest first.</p>
<div class="wrap"><table><thead><tr><th>Started</th><th>Result</th><th>Passed</th><th>Failed</th><th>Duration</th><th>Build</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No runs yet.</td></tr>'}</tbody></table></div>
</main></body></html>
`,
    'utf8',
  );
}
