// Unit tests: business rules called straight on the services, with no HTTP in between.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@jobboard/shared';
import { HttpError } from '../src/errors';
import { createRepos, type Repos } from '../src/repositories';
import { createServices, type Services } from '../src/services';
import { validateApplicationForm, validateJobForm } from '../src/services/validation';
import { ACCOUNTS, createContext } from './helpers';

let reseed: () => Promise<void>;
let repos: Repos;
let services: Services;

beforeAll(async () => {
  const c = await createContext();
  reseed = c.reseed;
  repos = createRepos(c.db);
  services = createServices(repos, { sessionDays: 7 });
});
beforeEach(async () => {
  await reseed();
});

const userByEmail = async (email: string): Promise<User> => {
  const { passwordHash: _h, ...user } = (await repos.users.findByEmail(email))!;
  return user;
};

const rejects = async (promise: Promise<unknown>, status: number) => {
  const err = await promise.then(
    () => undefined,
    (e) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
  return err as HttpError;
};

describe('search rules', () => {
  it('TC-01-1 keyword matches title, description and company', async () => {
    expect((await services.searchJobs('nurse', '')).map((j) => j.title)).toContain('Registered Nurse');
    expect((await services.searchJobs('pallets', '')).map((j) => j.title)).toEqual(['Forklift Operator']); // description only
    expect((await services.searchJobs('studio mono', '')).length).toBe(5); // company only
  });

  it('TC-01-5 search ignores upper and lower case', async () => {
    const lower = await services.searchJobs('frontend', '');
    const upper = await services.searchJobs('FRONTEND', 'MELBOURNE');
    expect(lower.map((j) => j.id)).toEqual(upper.map((j) => j.id));
    expect(lower.length).toBeGreaterThan(0);
  });

  it('non-text query values are treated as empty', async () => {
    expect(await services.searchJobs(undefined, ['x'])).toHaveLength(30);
  });
});

describe('job form validation', () => {
  const ok = { title: ' Chef ', location: 'Perth WA', workType: 'Casual', salary: '  ', description: 'd', requirements: 'r' };

  it('TC-05-2 / TC-06-2 each required field is reported', () => {
    for (const field of ['title', 'location', 'workType', 'description', 'requirements']) {
      try {
        validateJobForm({ ...ok, [field]: '' });
        expect.unreachable(`${field} should be required`);
      } catch (e) {
        expect((e as HttpError).status).toBe(422);
        expect(Object.keys((e as HttpError).fields!)).toEqual([field]);
      }
    }
  });

  it('trims text and turns a blank salary into null', () => {
    expect(validateJobForm(ok)).toMatchObject({ title: 'Chef', salary: null });
  });
});

describe('application form validation', () => {
  it('TC-03-3 the cover letter is required; the phone is optional', () => {
    expect(() => validateApplicationForm({ phone: '1', coverLetter: '' })).toThrow(HttpError);
    expect(validateApplicationForm({ coverLetter: ' hi ' })).toEqual({ phone: null, coverLetter: 'hi' });
  });
});

describe('application rules', () => {
  it('TC-03-1 saves the application with its date', async () => {
    const daniel = await userByEmail(ACCOUNTS.seekerNoApps);
    const [job] = await services.searchJobs('Kitchen Hand', '');
    const saved = await services.applyToJob(daniel, job.id, { phone: '0400', coverLetter: 'Hello' });
    expect(saved).toMatchObject({ jobTitle: 'Kitchen Hand', company: 'Corner Coffee Co.', coverLetter: 'Hello' });
    expect(Number.isNaN(Date.parse(saved.appliedAt))).toBe(false);
  });

  it('TC-03-4 the duplicate-application rule gives 409 and keeps one row', async () => {
    const alex = await userByEmail(ACCOUNTS.seeker);
    const [job] = await services.searchJobs('Frontend Developer', ''); // Alex has already applied
    const err = await rejects(services.applyToJob(alex, job.id, { coverLetter: 'again' }), 409);
    expect(err.code).toBe('ALREADY_APPLIED');
    expect((await services.getMyApplications(alex)).filter((a) => a.jobId === job.id)).toHaveLength(1);
  });
});

describe('ownership rules', () => {
  it('TC-06-3 only the owner can edit a job', async () => {
    const other = await userByEmail(ACCOUNTS.otherEmployer);
    const owner = await userByEmail(ACCOUNTS.employer);
    const [job] = await services.searchJobs('Frontend Developer', '');
    const form = { title: 'New', location: 'X', workType: 'Casual', description: 'd', requirements: 'r' };
    await rejects(services.updateJob(other, job.id, form), 403);
    expect((await services.updateJob(owner, job.id, form)).title).toBe('New');
  });

  it("TC-07-3 only the owner can read a job's applications", async () => {
    const other = await userByEmail(ACCOUNTS.otherEmployer);
    const owner = await userByEmail(ACCOUNTS.employer);
    const [job] = await services.searchJobs('Frontend Developer', '');
    await rejects(services.getApplicationsForJob(other, job.id), 403);
    expect((await services.getApplicationsForJob(owner, job.id)).applications).toHaveLength(5);
  });

  it('a missing job is 404 before ownership is considered', async () => {
    await rejects(services.getApplicationsForJob(await userByEmail(ACCOUNTS.employer), 99999), 404);
  });
});

describe('sign-in rules', () => {
  it('TC-08-3 unknown email and wrong password are indistinguishable', async () => {
    const a = await rejects(services.signIn('nobody@example.com', 'demo1234'), 401);
    const b = await rejects(services.signIn(ACCOUNTS.seeker, 'wrong'), 401);
    expect(a.message).toBe(b.message);
    expect(a.code).toBe(b.code);
  });

  it('a session lasts the configured number of days', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const timed = createServices(repos, { sessionDays: 7, now: () => start });
    const { sessionId, expiresAt } = await timed.signIn(ACCOUNTS.seeker, 'demo1234');
    expect(expiresAt.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(await timed.getCurrentUser(sessionId)).toMatchObject({ email: ACCOUNTS.seeker });
    const later = createServices(repos, { sessionDays: 7, now: () => new Date('2026-01-09T00:00:00Z') });
    expect(await later.getCurrentUser(sessionId)).toBeNull();
  });
});
