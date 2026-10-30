// Services hold the business rules (T-3): validation, ownership, duplicate applications.
// They call repositories and know nothing about HTTP.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { EmployerJob, Job, JobApplicant, MyApplication, User } from '@jobboard/shared';
import { HttpError, forbidden, invalid, notFound } from '../errors';
import { toPublicUser, type Repos } from '../repositories';
import { validateApplicationForm, validateJobForm } from './validation';

export interface ServiceOptions {
  sessionDays: number;
  /** Injectable clock so tests and the seed script control dates. */
  now?: () => Date;
}

export interface SignedIn {
  user: User;
  sessionId: string;
  expiresAt: Date;
}

export function createServices(repos: Repos, options: ServiceOptions) {
  const now = options.now ?? (() => new Date());

  // A hash to compare against when the email is unknown, so both failures take the same time.
  const decoyHash = bcrypt.hashSync('not-a-real-password', 4);

  async function loadOwnedJob(user: User, jobId: number): Promise<Job> {
    const job = await repos.jobs.findById(jobId);
    if (!job) throw notFound('Job not found.');
    if (job.ownerId !== user.id) throw forbidden('You can only manage your own job posts.');
    return job;
  }

  return {
    // ---- Authentication (UC-08, UC-09)
    async signIn(email: unknown, password: unknown): Promise<SignedIn> {
      const fields: Record<string, string> = {};
      if (typeof email !== 'string' || !email.trim()) fields.email = 'Enter your email address.';
      if (typeof password !== 'string' || !password) fields.password = 'Enter your password.';
      if (Object.keys(fields).length) throw invalid(fields);

      const record = await repos.users.findByEmail(email as string);
      const ok = await bcrypt.compare(password as string, record?.passwordHash ?? decoyHash);
      if (!record || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(now().getTime() + options.sessionDays * 24 * 60 * 60 * 1000);
      await repos.sessions.create(sessionId, record.id, expiresAt.toISOString());
      return { user: toPublicUser(record), sessionId, expiresAt };
    },

    async signOut(sessionId: string | undefined): Promise<void> {
      if (sessionId) await repos.sessions.delete(sessionId);
    },

    /** Returns the user for a session cookie, or null when nobody is signed in. */
    async getCurrentUser(sessionId: string | undefined): Promise<User | null> {
      if (!sessionId) return null;
      const userId = await repos.sessions.findUserId(sessionId, now().toISOString());
      if (!userId) return null;
      const record = await repos.users.findById(userId);
      return record ? toPublicUser(record) : null;
    },

    // ---- Jobs (UC-01, UC-02, UC-05, UC-06)
    searchJobs(keyword: unknown, location: unknown): Promise<Job[]> {
      return repos.jobs.search(typeof keyword === 'string' ? keyword : '', typeof location === 'string' ? location : '');
    },

    async getJob(id: number): Promise<Job> {
      const job = await repos.jobs.findById(id);
      if (!job) throw notFound('Job not found.');
      return job;
    },

    async createJob(user: User, input: unknown): Promise<Job> {
      const form = validateJobForm(input);
      const id = await repos.jobs.insert({ ownerId: user.id, ...form, postedAt: now().toISOString() });
      return (await repos.jobs.findById(id))!;
    },

    async updateJob(user: User, jobId: number, input: unknown): Promise<Job> {
      await loadOwnedJob(user, jobId);
      const form = validateJobForm(input);
      await repos.jobs.update(jobId, form);
      return (await repos.jobs.findById(jobId))!;
    },

    listMyJobs(user: User): Promise<EmployerJob[]> {
      return repos.jobs.listByOwner(user.id);
    },

    // ---- Applications (UC-03, UC-04, UC-07)
    async applyToJob(user: User, jobId: number, input: unknown): Promise<MyApplication> {
      const job = await repos.jobs.findById(jobId);
      if (!job) throw notFound('Job not found.');
      const form = validateApplicationForm(input);
      const duplicate = () => new HttpError(409, 'ALREADY_APPLIED', 'You have already applied for this job.');
      if (await repos.applications.findOne(jobId, user.id)) throw duplicate();
      try {
        await repos.applications.insert({ jobId, applicantId: user.id, ...form, appliedAt: now().toISOString() });
      } catch (err) {
        // Two clicks at once can both pass the check above; the unique index is the last line of defence.
        if (String((err as Error).message).includes('UNIQUE')) throw duplicate();
        throw err;
      }
      const saved = (await repos.applications.findOne(jobId, user.id))!;
      return { ...saved, jobTitle: job.title, company: job.company };
    },

    getMyApplications(user: User): Promise<MyApplication[]> {
      return repos.applications.findByApplicant(user.id);
    },

    async getApplicationsForJob(user: User, jobId: number): Promise<{ job: Job; applications: JobApplicant[] }> {
      const job = await loadOwnedJob(user, jobId);
      return { job, applications: await repos.applications.findByJob(jobId) };
    },
  };
}

export type Services = ReturnType<typeof createServices>;
