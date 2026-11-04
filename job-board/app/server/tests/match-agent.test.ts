import { describe, expect, it } from 'vitest';
import type { Job } from '@jobboard/shared';
import { scoreJobs } from '../src/scoring/matchAgent';
import { buildPrompt } from '../src/scoring/prompt';
import { FakeProvider } from '../src/scoring/provider';

const job = (id: number, title = `Job ${id}`, requirements = 'React experience\nTeamwork\nKubernetes'): Job => ({
  id, ownerId: 1, title, company: 'Acme', location: 'Hobart', workType: 'Full-time', salary: null,
  description: 'Build things.', requirements, postedAt: '2026-01-01T00:00:00Z',
});
const PROFILE = 'I have five years of React experience.';

describe('buildPrompt', () => {
  it('TC-11-4 prompt_contains_profile_and_posting_text', () => {
    const p = buildPrompt(job(1, 'Unique Title Z'), PROFILE);
    expect(p).toContain('Unique Title Z');
    expect(p).toContain('Build things.');
    expect(p).toContain('React experience\nTeamwork');
    expect(p).toContain(PROFILE);
  });
});

describe('scoreJobs', () => {
  it('TC-11-1 scores_every_job_and_keeps_request_order', async () => {
    const out = await scoreJobs([job(3), job(1), job(2)], PROFILE, new FakeProvider());
    expect(out.map((r) => r.jobId)).toEqual([3, 1, 2]);
    expect(out.every((r) => r.status === 'scored')).toBe(true);
    expect(out[0].criteria).toHaveLength(3);
    expect(out[0].criteria[0].level).toBe('Meets'); // "React" is in the profile
    expect(out[0].criteria[1].level).toBe('Unknown');
    expect(out[0]).toMatchObject({ overall: 1, checked: 1 });
  });

  it('TC-11-6 lanes_run_in_parallel', async () => {
    const start = Date.now();
    await scoreJobs([1, 2, 3, 4, 5].map((n) => job(n)), PROFILE, new FakeProvider({ delayMs: 100 }));
    expect(Date.now() - start).toBeLessThan(400);
  });

  it('TC-14-2 one_failing_job_is_not_scored_and_others_still_scored', async () => {
    const out = await scoreJobs([job(1), job(2, '[FAIL] Broken'), job(3)], PROFILE, new FakeProvider());
    expect(out.map((r) => r.status)).toEqual(['scored', 'not_scored', 'scored']);
    expect(out[1]).toMatchObject({ criteria: [], overall: null });
  });

  it('TC-14-2 TC-12-3 invalid_answer_marks_job_not_scored', async () => {
    const [r] = await scoreJobs([job(1, '[BAD] Wrong level')], PROFILE, new FakeProvider());
    expect(r.status).toBe('not_scored');
  });

  it('TC-14-5 empty_answer_is_no_criteria', async () => {
    const [r] = await scoreJobs([job(1, '[NONE] Vague')], PROFILE, new FakeProvider());
    expect(r).toMatchObject({ status: 'no_criteria', criteria: [], overall: null });
  });

  it('TC-14-4 slow_job_times_out_as_not_scored', async () => {
    const start = Date.now();
    const out = await scoreJobs([job(1, '[HANG] Never'), job(2)], PROFILE, new FakeProvider(), { timeoutMs: 50 });
    expect(out.map((r) => r.status)).toEqual(['not_scored', 'scored']);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('TC-14-3 all_jobs_failing_still_returns_a_result_for_each', async () => {
    const out = await scoreJobs([job(1, '[FAIL] a'), job(2, '[FAIL] b')], PROFILE, new FakeProvider());
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.status === 'not_scored')).toBe(true);
  });

  it('TC-12-2 more_than_five_requirements_give_at_most_five_criteria', async () => {
    const reqs = ['Alpha one', 'Beta two', 'Gamma three', 'Delta four', 'Epsilon five', 'Zeta six'].join('\n');
    const [r] = await scoreJobs([job(1, 'Many', reqs)], PROFILE, new FakeProvider());
    expect(r.criteria).toHaveLength(5);
  });
});
