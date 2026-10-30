// Stage 4 verification run:  npm run verify
// Runs every test in the test plan - unit/API tests (Vitest) and the browser tests + manual checklist
// (Playwright, in an open Chrome at human speed) - then writes docs/iteration-1/test-result/test-result-<start time>.html.
//
//   npm run verify                                  full run (needs `playw browser` open on port 9222)
//   npm run verify -- --slowmo 1000 --cdp http://localhost:9333
//   npm run verify -- --no-images                    do not capture screenshots (a much smaller result file)
//   npm run verify -- --render results/raw-<stamp>.json [--notes notes.json]   write the HTML again from a saved run
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ID, stamp, writeReport, type Level, type Notes, type PlanItem, type Raw, type Run } from './report';

const e2eDir = path.resolve(import.meta.dirname, '..');
const appDir = path.resolve(e2eDir, '..');
const docsDir = path.resolve(appDir, '../docs/iteration-1');
const resultDir = path.join(docsDir, 'test-result');
const resultsTmp = path.join(e2eDir, 'results');

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const ansi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

function parsePlan(): PlanItem[] {
  const html = fs.readFileSync(path.join(docsDir, 'test-plan/test-plan.html'), 'utf8');
  const text = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const items: PlanItem[] = [];
  let group = '';
  const token = /<h3>(.*?)<\/h3>|<h2 id="security">(.*?)<\/h2>|<tr><td class="id">((?:TC-\d\d-\d|SEC-\d))<\/td><td>(.*?)<\/td>(.*?)<\/tr>/gs;
  for (const m of html.matchAll(token)) {
    if (m[1]) group = text(m[1]).replace(/\s*(Must|Should|Could)$/, '');
    else if (m[2]) group = text(m[2]).replace(/^\d+\.\s*/, '');
    else {
      const letters = [...m[5].matchAll(/<span class="([UAE])">/g)].map((x) => x[1]);
      const levels: Level[] = [];
      if (letters.some((l) => l === 'U' || l === 'A')) levels.push('Unit/API');
      if (letters.includes('E')) levels.push('Browser');
      items.push({ id: m[3], group, text: text(m[4]), levels });
    }
  }
  const checklist = [
    'Each screen matches its mockup in static-design (layout, wording, empty states)',
    'Screens are usable in a narrow, phone-width window',
    'Forms can be completed with the keyboard only',
    'Error and confirmation messages are clear and polite',
    'The demo accounts box on Sign in lists working accounts',
  ];
  checklist.forEach((t, i) => items.push({ id: `MC-${i + 1}`, group: 'Manual checklist', text: t, levels: ['Browser'] }));
  return items;
}

function sh(cmd: string, cwd: string, env: Record<string, string> = {}) {
  console.log(`\n> ${cmd}   (in ${path.relative(appDir, cwd) || '.'})`);
  return spawnSync(cmd, { cwd, shell: true, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;
}

function collectVitest(file: string): Run[] {
  if (!fs.existsSync(file)) return [];
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return json.testResults.flatMap((f: any) =>
    f.assertionResults.map((a: any): Run => ({
      title: a.fullName ?? a.title,
      level: 'Unit/API',
      status: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped',
      durationMs: Math.round(a.duration ?? 0),
      error: a.failureMessages?.length ? ansi(a.failureMessages.join('\n')) : undefined,
      images: [],
      texts: [],
    })),
  );
}

function collectPlaywright(file: string): Run[] {
  if (!fs.existsSync(file)) return [];
  const out: Run[] = [];
  const walk = (suite: any) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const r = t.results?.at(-1);
        const run: Run = {
          title: spec.title,
          level: 'Browser',
          status: t.status === 'expected' ? 'passed' : t.status === 'skipped' ? 'skipped' : 'failed',
          durationMs: Math.round(r?.duration ?? 0),
          error: r?.error?.message ? ansi(r.error.message) : undefined,
          review: (t.annotations ?? []).find((a: any) => a.type === 'review')?.description,
          images: [],
          texts: [],
        };
        for (const a of r?.attachments ?? []) {
          if (!a.path || !fs.existsSync(a.path)) continue;
          if (a.contentType === 'image/png') run.images.push({ name: a.name, data: fs.readFileSync(a.path).toString('base64') });
          else if (a.contentType === 'text/plain') run.texts.push({ name: a.name, text: fs.readFileSync(a.path, 'utf8') });
        }
        out.push(run);
      }
    }
    (suite.suites ?? []).forEach(walk);
  };
  (JSON.parse(fs.readFileSync(file, 'utf8')).suites ?? []).forEach(walk);
  return out;
}

function gitInfo() {
  const git = (a: string) => spawnSync(`git ${a}`, { cwd: appDir, shell: true, encoding: 'utf8' }).stdout.trim();
  return { commit: git('rev-parse --short HEAD') || 'unknown', dirty: git('status --porcelain -- .').length > 0, node: process.versions.node };
}

async function main() {
  const renderFrom = opt('render');
  const notes: Notes = opt('notes') ? JSON.parse(fs.readFileSync(path.resolve(opt('notes')!), 'utf8')) : {};
  if (renderFrom) {
    const raw: Raw = JSON.parse(fs.readFileSync(path.resolve(renderFrom), 'utf8'));
    console.log('Wrote', writeReport(resultDir, raw, notes));
    return;
  }

  const cdp = opt('cdp', 'http://localhost:9222')!;
  const slowMo = Number(opt('slowmo', '600'));
  try {
    await fetch(`${cdp}/json/version`);
  } catch {
    console.error(`\nNo Chrome is listening on ${cdp}. Start one with:  playw browser\n(or pass --cdp <url> for a different port)`);
    process.exit(2);
  }

  const started = new Date();
  const id = stamp(started);
  fs.rmSync(resultsTmp, { recursive: true, force: true });
  fs.mkdirSync(resultsTmp, { recursive: true });

  if (!args.includes('--skip-build') && sh('npm run build -w web', appDir) !== 0) process.exit(1);
  const vitestFile = path.join(resultsTmp, 'vitest.json');
  sh(`npx vitest run --reporter=default --reporter=json --outputFile.json="${vitestFile}"`, path.join(appDir, 'server'));
  sh('npx playwright test -c playwright.verify.config.ts', e2eDir, {
    VERIFY: '1',
    VERIFY_SLOWMO: String(slowMo),
    VERIFY_CDP: cdp,
    VERIFY_NO_IMAGES: args.includes('--no-images') ? '1' : '',
  });

  const raw: Raw = {
    stamp: id,
    startedAt: started.toISOString(),
    durationMs: Date.now() - started.getTime(),
    build: gitInfo(),
    settings: { slowMo, cdp },
    plan: parsePlan(),
    runs: [...collectVitest(vitestFile), ...collectPlaywright(path.join(resultsTmp, 'playwright.json'))],
  };
  fs.writeFileSync(path.join(resultsTmp, `raw-${id}.json`), JSON.stringify(raw));
  const file = writeReport(resultDir, raw, notes);
  const failed = raw.runs.filter((r) => r.status === 'failed').length;
  console.log(`\nTest result saved: ${file}\n${raw.runs.length} tests ran, ${failed} failed.`);
  process.exitCode = failed ? 1 : 0;
}

void ID;
await main();
