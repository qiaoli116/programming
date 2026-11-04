// Fills the database with demo data. Safe to run repeatedly: it starts by emptying the tables.
// Goes through the repositories, so it exercises the same code as the app.
//   npm run seed            (from app/)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';
import { config } from '../src/config';
import { createDb, migrate } from '../src/db/knex';
import { createRepos } from '../src/repositories';
import { alexProfile, applicationsBySeeker, coverLetters, DEMO_PASSWORD, employers, jobs, seekers } from './data';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const closing = (index: number, company: string) =>
  index === 0
    ? 'We are a team of twelve with a relaxed, collaborative culture, flexible hours and two days a week in our Melbourne CBD office.'
    : `${company} offers a friendly team, fair pay and room to grow. Apply with a short cover letter and tell us why you would like the job.`;

export interface SeedOptions {
  /** bcrypt cost; tests pass a low number to stay fast. */
  rounds?: number;
  now?: Date;
}

export async function seedDatabase(db: Knex, { rounds = config.bcryptRounds, now = new Date() }: SeedOptions = {}) {
  const repos = createRepos(db);
  await repos.clearAll();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, rounds);

  const employerIds: number[] = [];
  for (const e of employers) {
    employerIds.push(await repos.users.insert({ ...e, passwordHash, role: 'employer' }));
  }
  const seekerIds: number[] = [];
  for (const s of seekers) {
    seekerIds.push(await repos.users.insert({ ...s, passwordHash, role: 'seeker' }));
  }

  const jobIds: number[] = [];
  for (const [index, job] of jobs.entries()) {
    const company = employers[job.employer].companyName;
    jobIds.push(
      await repos.jobs.insert({
        ownerId: employerIds[job.employer],
        title: job.title,
        location: job.location,
        workType: job.workType,
        salary: job.salary,
        description: `${job.about}\n\n${closing(index, company)}`,
        requirements: job.requirements.join('\n'),
        postedAt: new Date(now.getTime() - job.daysAgo * DAY).toISOString(),
      }),
    );
  }

  // Alex Chen (the first seeker) starts with a ready-made fictional profile, so match scoring can be tried at once.
  await repos.profiles.save(seekerIds[0], alexProfile, now.toISOString());

  let n = 0;
  for (const [seekerIndex, jobIndexes] of applicationsBySeeker.entries()) {
    for (const jobIndex of jobIndexes) {
      const posted = now.getTime() - jobs[jobIndex].daysAgo * DAY;
      const applied = Math.min(now.getTime(), posted + (3 + ((n * 7) % 40)) * HOUR);
      await repos.applications.insert({
        jobId: jobIds[jobIndex],
        applicantId: seekerIds[seekerIndex],
        phone: n % 3 === 0 ? null : `04${String(10000000 + n * 137913).slice(0, 8)}`,
        coverLetter: coverLetters[n % coverLetters.length],
        appliedAt: new Date(applied).toISOString(),
      });
      n++;
    }
  }

  return { employers: employerIds.length, seekers: seekerIds.length, jobs: jobIds.length, applications: n };
}

// Run directly: seed the configured database file.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const db = createDb(config.dbFile);
  migrate(db)
    .then(() => seedDatabase(db))
    .then((counts) => {
      console.log('Seeded', counts, `into ${config.dbFile}`);
      console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.destroy());
}
