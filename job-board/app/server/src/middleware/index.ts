import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role, User } from '@jobboard/shared';
import { HttpError, forbidden, unauthorized } from '../errors';
import type { Services } from '../services';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const SESSION_COOKIE = 'sid';

/** Express 4 does not catch rejected promises; this hands them to the error handler. */
export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

/** Looks up the session cookie and, if it is valid, attaches the user to the request. */
export const loadUser =
  (services: Services): RequestHandler =>
  (req, _res, next) => {
    services
      .getCurrentUser(req.cookies?.[SESSION_COOKIE])
      .then((user) => {
        req.user = user ?? undefined;
        next();
      })
      .catch(next);
  };

/** 401 when nobody is signed in. */
export const requireUser: RequestHandler = (req, _res, next) => (req.user ? next() : next(unauthorized()));

/** 401 when nobody is signed in, 403 when signed in with the wrong role. */
export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== role) return next(forbidden(`Only ${role}s can do that.`));
    next();
  };

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'NOT_FOUND', 'Not found.'));
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request body is not valid JSON.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side.' } });
}
