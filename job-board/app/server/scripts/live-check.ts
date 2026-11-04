// Manual live check (needs ANTHROPIC_API_KEY in app/.env): scores a few seeded jobs with the real AI
// using the sample profile, and prints the criteria. Run from app/: npm run live-check -w server
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config';
import { createDb } from '../src/db/knex';
import { createRepos } from '../src/repositories';
import { scoreJobs } from '../src/scoring/matchAgent';
import { AnthropicProvider } from '../src/scoring/anthropicProvider';

async function main() {
  if (!config.anthropicApiKey) throw new Error('No ANTHROPIC_API_KEY found in app/.env');
  const profile = fs.readFileSync(path.resolve(process.cwd(), '../../devlog/iteration-2/assets/sample-profile-alex-chen.md'), 'utf8');
  const repos = createRepos(createDb(config.dbFile));
  const count = Number(process.argv[2] ?? 4);
  const jobs = (await repos.jobs.search('', '')).slice(0, count);
  const started = Date.now();
  const results = await scoreJobs(jobs, profile, new AnthropicProvider(config.anthropicApiKey));
  console.log(`Scored ${jobs.length} jobs in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
  for (const [i, r] of results.entries()) {
    console.log(`## ${jobs[i].title} (${jobs[i].company}) -> ${r.status}, overall ${r.overall === null ? '-' : Math.round(r.overall * 10) + '/10'}, ${r.checked} checked`);
    for (const c of r.criteria) console.log(`   [${c.level}] ${c.criterion}\n       ${c.reason}`);
    console.log();
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
