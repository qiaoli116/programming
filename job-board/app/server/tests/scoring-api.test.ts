// Phase D: POST /scoring with the fake AI. Test ids: TC-11-x, TC-12-x, TC-14-x, SEC-8.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/scoring/provider';
import { ACCOUNTS, anonymous, createContext, signedIn, validJob, type TestContext } from './helpers';

const fake = new FakeProvider();
let ctx: TestContext;
let reseed: () => Promise<void>;
let noAi: TestContext['app'];

beforeAll(async () => {
  const c = await createContext({ scoring: fake, scoringTimeoutMs: 200 });
  ctx = c;
  reseed = c.reseed;
  const other = await createContext(); // a second app with no provider
  await other.reseed();
  noAi = other.app;
});
beforeEach(async () => {
  await reseed();
  fake.calls = 0;
});

const PROFILE = 'I have React, TypeScript and teamwork experience.';
const seekerWithProfile = async (body = PROFILE) => {
  const agent = await signedIn(ctx.app, ACCOUNTS.seeker);
  await agent.put('/api/v1/me/profile').send({ body });
  return agent;
};
const jobIds = async (n = 3): Promise<number[]> => (await ctx.db('jobs').select('id').orderBy('id').limit(n)).map((r: any) => r.id);

describe('UC-11 scoring', () => {
  it('TC-11-1 TC-12-1 seeker_scores_a_list_of_jobs', async () => {
    const agent = await seekerWithProfile();
    const ids = await jobIds(3);
    const res = await agent.post('/api/v1/scoring').send({ jobIds: ids });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: any) => r.jobId)).toEqual(ids);
    for (const r of res.body.results) {
      expect(r.status).toBe('scored');
      expect(r.criteria.length).toBeGreaterThan(0);
      expect(r.criteria.length).toBeLessThanOrEqual(5);
    }
  });

  it('TC-11-4 SEC-9 server_uses_saved_profile_not_one_sent_in_the_request', async () => {
    const agent = await seekerWithProfile('Nothing relevant here at all.');
    const res = await agent.post('/api/v1/scoring').send({ jobIds: await jobIds(2), profile: 'react typescript everything' });
    expect(res.status).toBe(200);
    expect(res.body.results.every((r: any) => r.criteria.every((c: any) => c.level === 'Unknown'))).toBe(true);
  });

  it('TC-11-5 scoring_changes_nothing_in_the_database', async () => {
    const agent = await seekerWithProfile();
    const count = async () => [await ctx.db('jobs').count({ n: '*' }).first(), await ctx.db('applications').count({ n: '*' }).first()];
    const before = await count();
    await agent.post('/api/v1/scoring').send({ jobIds: await jobIds(3) });
    expect(await count()).toEqual(before);
  });

  it('TC-11-8 unknown_job_ids_are_skipped', async () => {
    const agent = await seekerWithProfile();
    const [a] = await jobIds(1);
    const res = await agent.post('/api/v1/scoring').send({ jobIds: [999999, a] });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: any) => r.jobId)).toEqual([a]);
  });

  it('TC-11-8 bad_id_lists_are_rejected', async () => {
    const agent = await seekerWithProfile();
    const bad = [[], Array.from({ length: 21 }, (_, i) => i + 1), [1, 1], ['1'], [0], 'x', undefined];
    for (const ids of bad) {
      const res = await agent.post('/api/v1/scoring').send({ jobIds: ids });
      expect(res.status, JSON.stringify(ids)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(fake.calls).toBe(0);
  });

  it('TC-11-9 SEC-8 employer_and_signed_out_are_refused', async () => {
    const body = { jobIds: [1] };
    expect((await (await signedIn(ctx.app, ACCOUNTS.employer)).post('/api/v1/scoring').send(body)).status).toBe(403);
    expect((await anonymous(ctx.app).post('/api/v1/scoring').send(body)).status).toBe(401);
  });
});

describe('UC-14 failures', () => {
  it('TC-14-1 blank_profile_returns_profile_empty_and_calls_no_ai', async () => {
    const agent = await signedIn(ctx.app, ACCOUNTS.seekerNoApps);
    let res = await agent.post('/api/v1/scoring').send({ jobIds: await jobIds(2) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PROFILE_EMPTY');
    await agent.put('/api/v1/me/profile').send({ body: '  \n ' });
    res = await agent.post('/api/v1/scoring').send({ jobIds: await jobIds(2) });
    expect(res.body.error.code).toBe('PROFILE_EMPTY');
    expect(fake.calls).toBe(0);
  });

  it('TC-14-6 TC-14-3 no_provider_configured_returns_503', async () => {
    const agent = await signedIn(noAi, ACCOUNTS.seeker);
    await agent.put('/api/v1/me/profile').send({ body: 'React' });
    const res = await agent.post('/api/v1/scoring').send({ jobIds: [1] });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SCORING_UNAVAILABLE');
    // everything else still works without a key
    expect((await agent.get('/api/v1/jobs')).status).toBe(200);
  });

  it('TC-14-2 one_failing_job_does_not_fail_the_request', async () => {
    const agent = await seekerWithProfile();
    const employer = await signedIn(ctx.app, ACCOUNTS.employer);
    const made = await employer.post('/api/v1/jobs').send({ ...validJob, title: '[FAIL] Broken job' });
    const [a, b] = await jobIds(2);
    const res = await agent.post('/api/v1/scoring').send({ jobIds: [a, made.body.job.id, b] });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: any) => r.status)).toEqual(['scored', 'not_scored', 'scored']);
  });

  it('TC-14-3 all_failing_still_returns_200_with_every_job_not_scored', async () => {
    const agent = await seekerWithProfile();
    const employer = await signedIn(ctx.app, ACCOUNTS.employer);
    const x = await employer.post('/api/v1/jobs').send({ ...validJob, title: '[FAIL] One' });
    const y = await employer.post('/api/v1/jobs').send({ ...validJob, title: '[HANG] Two' });
    const res = await agent.post('/api/v1/scoring').send({ jobIds: [x.body.job.id, y.body.job.id] });
    expect(res.status).toBe(200);
    expect(res.body.results.every((r: any) => r.status === 'not_scored')).toBe(true);
  });

  it('TC-14-5 a_posting_with_no_clear_criteria_is_no_criteria', async () => {
    const agent = await seekerWithProfile();
    const employer = await signedIn(ctx.app, ACCOUNTS.employer);
    const made = await employer.post('/api/v1/jobs').send({ ...validJob, title: '[NONE] Vague' });
    const res = await agent.post('/api/v1/scoring').send({ jobIds: [made.body.job.id] });
    expect(res.body.results[0]).toMatchObject({ status: 'no_criteria', criteria: [], overall: null });
  });
});
