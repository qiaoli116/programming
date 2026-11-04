// The REST API under /api/v1 (T-4). Routes only translate HTTP to service calls and back.
import { Router } from 'express';
import type { User } from '@jobboard/shared';
import { notFound } from '../errors';
import { SESSION_COOKIE, requireRole, wrap } from '../middleware';
import type { Services } from '../services';

export interface RouterOptions {
  secureCookie: boolean;
}

// The middleware guarantees a user on protected routes.
const me = (req: { user?: User }) => req.user as User;

function jobId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw notFound('Job not found.');
  return id;
}

export function createApiRouter(services: Services, options: RouterOptions): Router {
  const api = Router();

  // ---- Authentication
  api.post(
    '/auth/sign-in',
    wrap(async (req, res) => {
      const { user, sessionId, expiresAt } = await services.signIn(req.body?.email, req.body?.password);
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.secureCookie,
        expires: expiresAt,
        path: '/',
      });
      res.json({ user });
    }),
  );

  api.post(
    '/auth/sign-out',
    wrap(async (req, res) => {
      await services.signOut(req.cookies?.[SESSION_COOKIE]);
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    }),
  );

  // "Nobody" is a normal answer here, not an error, so the browser can ask on every page load.
  api.get('/auth/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  // ---- Profile and match scoring (iteration 2)
  api.get(
    '/me/profile',
    requireRole('seeker'),
    wrap(async (req, res) => {
      res.json({ profile: await services.getProfile(me(req)) });
    }),
  );

  api.put(
    '/me/profile',
    requireRole('seeker'),
    wrap(async (req, res) => {
      res.json({ profile: await services.saveProfile(me(req), req.body) });
    }),
  );

  api.post(
    '/scoring',
    requireRole('seeker'),
    wrap(async (req, res) => {
      res.json({ results: await services.scoreJobs(me(req), req.body) });
    }),
  );

  // ---- Jobs
  api.get(
    '/jobs',
    wrap(async (req, res) => {
      res.json({ jobs: await services.searchJobs(req.query.keyword, req.query.location) });
    }),
  );

  api.post(
    '/jobs',
    requireRole('employer'),
    wrap(async (req, res) => {
      res.status(201).json({ job: await services.createJob(me(req), req.body) });
    }),
  );

  api.get(
    '/jobs/:id',
    wrap(async (req, res) => {
      res.json({ job: await services.getJob(jobId(req.params.id)) });
    }),
  );

  api.put(
    '/jobs/:id',
    requireRole('employer'),
    wrap(async (req, res) => {
      res.json({ job: await services.updateJob(me(req), jobId(req.params.id), req.body) });
    }),
  );

  // ---- Applications
  api.post(
    '/jobs/:id/applications',
    requireRole('seeker'),
    wrap(async (req, res) => {
      res.status(201).json({ application: await services.applyToJob(me(req), jobId(req.params.id), req.body) });
    }),
  );

  api.get(
    '/jobs/:id/applications',
    requireRole('employer'),
    wrap(async (req, res) => {
      res.json(await services.getApplicationsForJob(me(req), jobId(req.params.id)));
    }),
  );

  api.get(
    '/me/applications',
    requireRole('seeker'),
    wrap(async (req, res) => {
      res.json({ applications: await services.getMyApplications(me(req)) });
    }),
  );

  api.get(
    '/employer/jobs',
    requireRole('employer'),
    wrap(async (req, res) => {
      res.json({ jobs: await services.listMyJobs(me(req)) });
    }),
  );

  return api;
}
