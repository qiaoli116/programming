import request from 'supertest';
import type { Knex } from 'knex';
import { createApp } from '../src/app';
import { createDb, migrate } from '../src/db/knex';
import { seedDatabase } from '../seed/seed';
import { DEMO_PASSWORD } from '../seed/data';

export const ACCOUNTS = {
  seeker: 'alex.chen@example.com', // has many applications
  seekerNoApps: 'daniel.okafor@example.com', // has applied to nothing
  otherSeeker: 'sam.rivera@example.com',
  employer: 'hiring@northwind.example', // owns Frontend Developer and 4 more
  otherEmployer: 'hiring@cornercoffee.example',
};

export interface TestContext {
  db: Knex;
  app: ReturnType<typeof createApp>;
}

/** A fresh in-memory database, migrated and seeded. Call reseed() before each test. */
export async function createContext(
  options: Pick<Parameters<typeof createApp>[0], 'scoring' | 'scoringTimeoutMs'> = {},
): Promise<TestContext & { reseed: () => Promise<void> }> {
  const db = createDb(':memory:');
  await migrate(db);
  const app = createApp({ db, ...options });
  const reseed = async () => {
    await seedDatabase(db, { rounds: 4 });
  };
  return { db, app, reseed };
}

/** A supertest agent that keeps the session cookie, signed in as the given account. */
export async function signedIn(app: TestContext['app'], email: string, password = DEMO_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/sign-in').send({ email, password });
  if (res.status !== 200) throw new Error(`Sign-in as ${email} failed: ${res.status}`);
  return agent;
}

export const anonymous = (app: TestContext['app']) => request(app);

export const validJob = {
  title: 'Test Engineer',
  location: 'Hobart TAS',
  workType: 'Full-time',
  salary: '$80k',
  description: 'Test things.',
  requirements: 'Careful\nCurious',
};

export const validApplication = { phone: '0400 000 000', coverLetter: 'Please consider me.' };

/** Finds a seeded job by title through the API. */
export async function jobIdByTitle(app: TestContext['app'], title: string): Promise<number> {
  const res = await request(app).get('/api/v1/jobs').query({ keyword: title });
  const job = res.body.jobs.find((j: { title: string }) => j.title === title);
  if (!job) throw new Error(`No seeded job titled ${title}`);
  return job.id;
}
