// API tests: one describe per use case, test names start with the id from the test plan
// (docs/iteration-1/test-plan/test-plan.html). Unit-level cases are in unit.test.ts.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCOUNTS,
  anonymous,
  createContext,
  jobIdByTitle,
  signedIn,
  validApplication,
  validJob,
  type TestContext,
} from './helpers';

let ctx: TestContext;
let reseed: () => Promise<void>;
let app: TestContext['app'];

beforeAll(async () => {
  const c = await createContext();
  ctx = c;
  reseed = c.reseed;
  app = c.app;
});
beforeEach(async () => {
  await reseed();
});

const titles = (body: any) => body.jobs.map((j: any) => j.title as string);

describe('UC-01 Search for jobs', () => {
  it('TC-01-1 keyword matches title, description or company', async () => {
    const byTitle = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'barista' });
    expect(titles(byTitle.body)).toEqual(['Barista']);

    const byCompany = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'quickship' });
    expect(byCompany.body.jobs).toHaveLength(6);
    expect(byCompany.body.jobs.every((j: any) => j.company === 'QuickShip Logistics')).toBe(true);

    // "pallets" appears only in a description, not in any title or company name
    const byDescription = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'pallets' });
    expect(titles(byDescription.body)).toEqual(['Forklift Operator']);
  });

  it('TC-01-2 location narrows the result and combines with the keyword', async () => {
    const sydney = await anonymous(app).get('/api/v1/jobs').query({ location: 'Sydney' });
    expect(sydney.body.jobs.length).toBeGreaterThan(0);
    expect(sydney.body.jobs.every((j: any) => j.location.includes('Sydney'))).toBe(true);

    const both = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'analyst', location: 'Sydney' });
    expect(titles(both.body)).toEqual(['Data Analyst']);

    const wrongCity = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'analyst', location: 'Perth' });
    expect(wrongCity.body.jobs).toEqual([]);
  });

  it('TC-01-3 empty fields list every job, newest first', async () => {
    const res = await anonymous(app).get('/api/v1/jobs');
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(30);
    const dates = res.body.jobs.map((j: any) => j.postedAt as string);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(res.body.jobs[0].title).toBe('Frontend Developer'); // posted 2 days ago, the most recent
  });

  it('TC-01-4 nothing matches: an empty list, not an error', async () => {
    const res = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'astronaut' });
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });
});

describe('UC-02 View job details', () => {
  it('TC-02-1 returns every field of the job', async () => {
    const id = await jobIdByTitle(app, 'Frontend Developer');
    const res = await anonymous(app).get(`/api/v1/jobs/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({
      title: 'Frontend Developer',
      company: 'Northwind Digital',
      location: 'Melbourne VIC',
      workType: 'Full-time',
      salary: '$90k – $110k',
    });
    expect(res.body.job.description).toContain('Frontend Developer');
    expect(res.body.job.requirements.split('\n')).toHaveLength(4);
  });

  it('TC-02-2 a job with no salary comes back with salary null', async () => {
    const id = await jobIdByTitle(app, 'Data Analyst');
    const res = await anonymous(app).get(`/api/v1/jobs/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.job.salary).toBeNull();
  });

  it('TC-02-3 unknown job id gives 404', async () => {
    const res = await anonymous(app).get('/api/v1/jobs/99999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect((await anonymous(app).get('/api/v1/jobs/abc')).status).toBe(404);
  });
});

describe('UC-03 Apply for a job', () => {
  it('TC-03-1 a seeker applies; the application is saved with its date', async () => {
    const id = await jobIdByTitle(app, 'Kitchen Hand');
    const seeker = await signedIn(app, ACCOUNTS.seekerNoApps);
    const before = Date.now();
    const res = await seeker.post(`/api/v1/jobs/${id}/applications`).send(validApplication);
    expect(res.status).toBe(201);
    expect(res.body.application).toMatchObject({ jobId: id, jobTitle: 'Kitchen Hand', phone: '0400 000 000' });
    expect(new Date(res.body.application.appliedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const mine = await seeker.get('/api/v1/me/applications');
    expect(mine.body.applications).toHaveLength(1);
  });

  it('TC-03-3 cover letter missing: 422 with a field message, nothing saved', async () => {
    const id = await jobIdByTitle(app, 'Kitchen Hand');
    const seeker = await signedIn(app, ACCOUNTS.seekerNoApps);
    const res = await seeker.post(`/api/v1/jobs/${id}/applications`).send({ phone: '0400', coverLetter: '   ' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.coverLetter).toBeTruthy();
    expect((await seeker.get('/api/v1/me/applications')).body.applications).toEqual([]);
  });

  it('TC-03-4 applying twice is refused with 409', async () => {
    const id = await jobIdByTitle(app, 'Kitchen Hand');
    const seeker = await signedIn(app, ACCOUNTS.seekerNoApps);
    await seeker.post(`/api/v1/jobs/${id}/applications`).send(validApplication).expect(201);
    const second = await seeker.post(`/api/v1/jobs/${id}/applications`).send(validApplication);
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/already applied/i);
    expect((await seeker.get('/api/v1/me/applications')).body.applications).toHaveLength(1);
  });

  it('TC-03-5 an employer cannot apply (403)', async () => {
    const id = await jobIdByTitle(app, 'Kitchen Hand');
    const employer = await signedIn(app, ACCOUNTS.employer);
    expect((await employer.post(`/api/v1/jobs/${id}/applications`).send(validApplication)).status).toBe(403);
  });

  it('applying to a job that does not exist gives 404', async () => {
    const seeker = await signedIn(app, ACCOUNTS.seekerNoApps);
    expect((await seeker.post('/api/v1/jobs/99999/applications').send(validApplication)).status).toBe(404);
  });
});

describe('UC-04 View my applications', () => {
  it('TC-04-1 a seeker sees only their own applications, with job title and company', async () => {
    const alex = await signedIn(app, ACCOUNTS.seeker);
    const res = await alex.get('/api/v1/me/applications');
    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(10);
    expect(res.body.applications[0]).toHaveProperty('jobTitle');
    expect(res.body.applications[0]).toHaveProperty('company');
    const dates = res.body.applications.map((a: any) => a.appliedAt as string);
    expect([...dates].sort().reverse()).toEqual(dates);

    const sam = await signedIn(app, ACCOUNTS.otherSeeker);
    const samApps = (await sam.get('/api/v1/me/applications')).body.applications;
    expect(samApps).toHaveLength(6);
    const alexIds = new Set(res.body.applications.map((a: any) => a.id));
    expect(samApps.some((a: any) => alexIds.has(a.id))).toBe(false);
  });

  it('TC-04-2 a seeker with no applications gets an empty list', async () => {
    const daniel = await signedIn(app, ACCOUNTS.seekerNoApps);
    const res = await daniel.get('/api/v1/me/applications');
    expect(res.status).toBe(200);
    expect(res.body.applications).toEqual([]);
  });

  it('TC-04-3 signed out gives 401', async () => {
    expect((await anonymous(app).get('/api/v1/me/applications')).status).toBe(401);
  });
});

describe('UC-05 Post a job', () => {
  it('TC-05-1 an employer posts a job; it is owned by them and found in search under their company', async () => {
    const employer = await signedIn(app, ACCOUNTS.employer);
    const res = await employer.post('/api/v1/jobs').send(validJob);
    expect(res.status).toBe(201);
    expect(res.body.job).toMatchObject({ title: 'Test Engineer', company: 'Northwind Digital' });

    const search = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'Test Engineer' });
    expect(search.body.jobs).toHaveLength(1);
    expect(search.body.jobs[0].company).toBe('Northwind Digital');

    const mine = await employer.get('/api/v1/employer/jobs');
    expect(mine.body.jobs.map((j: any) => j.title)).toContain('Test Engineer');
    const other = await signedIn(app, ACCOUNTS.otherEmployer);
    expect((await other.get('/api/v1/employer/jobs')).body.jobs.map((j: any) => j.title)).not.toContain('Test Engineer');
  });

  it('TC-05-2 a missing required field gives 422 with field messages; nothing saved', async () => {
    const employer = await signedIn(app, ACCOUNTS.employer);
    const res = await employer.post('/api/v1/jobs').send({ ...validJob, title: '', requirements: '' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['requirements', 'title']);
    expect((await anonymous(app).get('/api/v1/jobs')).body.jobs).toHaveLength(30);
  });

  it('TC-05-3 a seeker cannot post (403)', async () => {
    const seeker = await signedIn(app, ACCOUNTS.seeker);
    expect((await seeker.post('/api/v1/jobs').send(validJob)).status).toBe(403);
  });
});

describe('UC-06 Edit a job post', () => {
  it('TC-06-1 the owner edits a post; the change shows on the job page and in search', async () => {
    const id = await jobIdByTitle(app, 'Frontend Developer');
    const employer = await signedIn(app, ACCOUNTS.employer);
    const res = await employer.put(`/api/v1/jobs/${id}`).send({ ...validJob, title: 'Senior Frontend Developer', salary: '' });
    expect(res.status).toBe(200);
    expect(res.body.job.salary).toBeNull();

    expect((await anonymous(app).get(`/api/v1/jobs/${id}`)).body.job.title).toBe('Senior Frontend Developer');
    const search = await anonymous(app).get('/api/v1/jobs').query({ keyword: 'Senior Frontend' });
    expect(titles(search.body)).toEqual(['Senior Frontend Developer']);
  });

  it('TC-06-2 emptying a required field gives 422 and keeps the old data', async () => {
    const id = await jobIdByTitle(app, 'Frontend Developer');
    const employer = await signedIn(app, ACCOUNTS.employer);
    const res = await employer.put(`/api/v1/jobs/${id}`).send({ ...validJob, description: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.description).toBeTruthy();
    expect((await anonymous(app).get(`/api/v1/jobs/${id}`)).body.job.title).toBe('Frontend Developer');
  });

  it('editing a job that does not exist gives 404', async () => {
    const employer = await signedIn(app, ACCOUNTS.employer);
    expect((await employer.put('/api/v1/jobs/99999').send(validJob)).status).toBe(404);
  });
});

describe('UC-07 View applications for a job', () => {
  it('TC-07-1 the owner sees applicants with name, email and date', async () => {
    const id = await jobIdByTitle(app, 'Frontend Developer');
    const employer = await signedIn(app, ACCOUNTS.employer);
    const res = await employer.get(`/api/v1/jobs/${id}/applications`);
    expect(res.status).toBe(200);
    expect(res.body.job.title).toBe('Frontend Developer');
    expect(res.body.applications).toHaveLength(5);
    expect(res.body.applications[0]).toMatchObject({
      applicantName: expect.any(String),
      applicantEmail: expect.stringContaining('@'),
      appliedAt: expect.any(String),
      coverLetter: expect.any(String),
    });
  });

  it('TC-07-2 a post with no applications returns an empty list', async () => {
    const employer = await signedIn(app, ACCOUNTS.employer);
    const created = await employer.post('/api/v1/jobs').send(validJob); // a new post has no applicants
    const res = await employer.get(`/api/v1/jobs/${created.body.job.id}/applications`);
    expect(res.status).toBe(200);
    expect(res.body.applications).toEqual([]);
  });
});

describe('UC-08 Sign in', () => {
  it('TC-08-1 a seeker signs in and receives their profile', async () => {
    const res = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: ACCOUNTS.seeker, password: 'demo1234' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Alex Chen', role: 'seeker' });
  });

  it('TC-08-2 an employer signs in and receives their company', async () => {
    const res = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: ACCOUNTS.employer, password: 'demo1234' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'employer', companyName: 'Northwind Digital' });
  });

  it('TC-08-3 wrong password and unknown email give the same generic 401', async () => {
    const wrongPassword = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: ACCOUNTS.seeker, password: 'nope' });
    const unknownEmail = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: 'nobody@example.com', password: 'demo1234' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('TC-08-5 /auth/me returns the user when signed in and null when not', async () => {
    expect((await anonymous(app).get('/api/v1/auth/me')).body).toEqual({ user: null });
    const seeker = await signedIn(app, ACCOUNTS.seeker);
    const me = await seeker.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(ACCOUNTS.seeker);
  });

  it('empty email and password give 422 with field messages', async () => {
    const res = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: '', password: '' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'password']);
  });

  it('email matching ignores case and spaces', async () => {
    const res = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: '  ALEX.Chen@Example.com ', password: 'demo1234' });
    expect(res.status).toBe(200);
  });
});

describe('UC-09 Sign out', () => {
  it('TC-09-1 sign out ends the session', async () => {
    const seeker = await signedIn(app, ACCOUNTS.seeker);
    expect((await seeker.post('/api/v1/auth/sign-out')).status).toBe(204);
    expect((await seeker.get('/api/v1/auth/me')).body).toEqual({ user: null });
  });

  it('TC-09-2 after sign out, protected endpoints ask for sign-in again', async () => {
    const seeker = await signedIn(app, ACCOUNTS.seeker);
    await seeker.post('/api/v1/auth/sign-out');
    expect((await seeker.get('/api/v1/me/applications')).status).toBe(401);
  });
});

describe('Permissions and security', () => {
  const protectedEndpoints = [
    { method: 'get', path: '/api/v1/me/applications', role: 'seeker' },
    { method: 'get', path: '/api/v1/employer/jobs', role: 'employer' },
    { method: 'post', path: '/api/v1/jobs', role: 'employer' },
    { method: 'put', path: '/api/v1/jobs/1', role: 'employer' },
    { method: 'post', path: '/api/v1/jobs/1/applications', role: 'seeker' },
    { method: 'get', path: '/api/v1/jobs/1/applications', role: 'employer' },
  ] as const;

  it('SEC-1 every protected endpoint gives 401 with no session and 403 with the wrong role', async () => {
    const seeker = await signedIn(app, ACCOUNTS.seeker);
    const employer = await signedIn(app, ACCOUNTS.employer);
    for (const e of protectedEndpoints) {
      const noSession = await (anonymous(app) as any)[e.method](e.path).send({});
      expect(noSession.status, `${e.method} ${e.path} without a session`).toBe(401);
      const wrong = e.role === 'seeker' ? employer : seeker;
      const wrongRole = await (wrong as any)[e.method](e.path).send({});
      expect(wrongRole.status, `${e.method} ${e.path} with the wrong role`).toBe(403);
    }
  });

  it('TC-06-3 editing another employer\'s post is refused (403)', async () => {
    const id = await jobIdByTitle(app, 'Frontend Developer'); // Northwind's
    const other = await signedIn(app, ACCOUNTS.otherEmployer);
    const res = await other.put(`/api/v1/jobs/${id}`).send({ ...validJob, title: 'Hijacked' });
    expect(res.status).toBe(403);
    expect((await anonymous(app).get(`/api/v1/jobs/${id}`)).body.job.title).toBe('Frontend Developer');
  });

  it("TC-07-3 another employer's applications are refused (403)", async () => {
    const id = await jobIdByTitle(app, 'Frontend Developer');
    const other = await signedIn(app, ACCOUNTS.otherEmployer);
    expect((await other.get(`/api/v1/jobs/${id}/applications`)).status).toBe(403);
  });

  it('SEC-2 no endpoint returns a password hash', async () => {
    const seeker = await signedIn(app, ACCOUNTS.seeker);
    const employer = await signedIn(app, ACCOUNTS.employer);
    const id = await jobIdByTitle(app, 'Frontend Developer');
    const bodies = [
      (await anonymous(app).post('/api/v1/auth/sign-in').send({ email: ACCOUNTS.seeker, password: 'demo1234' })).text,
      (await seeker.get('/api/v1/auth/me')).text,
      (await seeker.get('/api/v1/me/applications')).text,
      (await anonymous(app).get('/api/v1/jobs')).text,
      (await anonymous(app).get(`/api/v1/jobs/${id}`)).text,
      (await employer.get('/api/v1/employer/jobs')).text,
      (await employer.get(`/api/v1/jobs/${id}/applications`)).text,
    ];
    for (const body of bodies) {
      expect(body).not.toMatch(/\$2[aby]\$/); // bcrypt prefix
      expect(body.toLowerCase()).not.toContain('password');
    }
  });

  it('SEC-3 the session cookie is HttpOnly and a signed-out session id stops working', async () => {
    const res = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: ACCOUNTS.seeker, password: 'demo1234' });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const sid = cookie.split(';')[0];
    expect((await anonymous(app).get('/api/v1/me/applications').set('Cookie', sid)).status).toBe(200);
    await anonymous(app).post('/api/v1/auth/sign-out').set('Cookie', sid);
    expect((await anonymous(app).get('/api/v1/me/applications').set('Cookie', sid)).status).toBe(401);
  });

  it('SEC-3 an expired session does not work', async () => {
    const res = await anonymous(app).post('/api/v1/auth/sign-in').send({ email: ACCOUNTS.seeker, password: 'demo1234' });
    const sid = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await ctx.db('sessions').update({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await anonymous(app).get('/api/v1/me/applications').set('Cookie', sid)).status).toBe(401);
  });

  it("SEC-4 a search for ' OR 1=1 -- returns no extra rows and no error", async () => {
    const res = await anonymous(app).get('/api/v1/jobs').query({ keyword: "' OR 1=1 --" });
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
    const loc = await anonymous(app).get('/api/v1/jobs').query({ location: "'; DROP TABLE jobs; --" });
    expect(loc.status).toBe(200);
    expect((await anonymous(app).get('/api/v1/jobs')).body.jobs).toHaveLength(30);
  });

  it('SEC-4 % and _ in a search are treated as plain text', async () => {
    expect((await anonymous(app).get('/api/v1/jobs').query({ keyword: '%' })).body.jobs).toEqual([]);
    expect((await anonymous(app).get('/api/v1/jobs').query({ keyword: '_' })).body.jobs).toEqual([]);
  });

  it('SEC-5 passwords in the database are hashes, not the text demo1234', async () => {
    const rows = await ctx.db('users').select('password_hash');
    expect(rows).toHaveLength(14);
    for (const row of rows) {
      expect(row.password_hash).not.toContain('demo1234');
      expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    }
  });

  it('SEC-6 input is validated on the server even if the browser checks are bypassed', async () => {
    const employer = await signedIn(app, ACCOUNTS.employer);
    const bad = await employer.post('/api/v1/jobs').send({ title: 42, location: null, workType: 'Freelance', description: {}, requirements: [] });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['description', 'location', 'requirements', 'title', 'workType']);

    const tooLong = await employer.post('/api/v1/jobs').send({ ...validJob, title: 'x'.repeat(500) });
    expect(tooLong.status).toBe(422);

    const seeker = await signedIn(app, ACCOUNTS.seekerNoApps);
    const id = await jobIdByTitle(app, 'Kitchen Hand');
    expect((await seeker.post(`/api/v1/jobs/${id}/applications`).send({ coverLetter: 123 })).status).toBe(422);
    expect((await seeker.post(`/api/v1/jobs/${id}/applications`).set('Content-Type', 'application/json').send('{not json')).status).toBe(400);
  });
});
