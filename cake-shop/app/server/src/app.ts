import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { HttpError } from './errors';
import type { Assistant } from './assistant/service';
import { sweepAbandoned } from './orders/status';
import { nowOf, type Clock } from './orders/applyChange';
import { bakerRouter } from './routes/baker';
import { customerRouter } from './routes/customer';
import type { OrderStore } from './store';

export interface AppOptions {
  store: OrderStore;
  assistant: Assistant;
  clock?: Clock;
  bakerPassword: string;
  sessionHours?: number;
  secureCookie?: boolean;
  webDist?: string;
}

export function createApp(opts: AppOptions) {
  const clock = opts.clock ?? (() => new Date());
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Orders idle for 7 days are abandoned. Cheap enough to run on each API request.
  app.use('/api', (_req, _res, next) => {
    sweepAbandoned(opts.store, nowOf(clock));
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/baker', bakerRouter({ store: opts.store, clock, password: opts.bakerPassword, sessionHours: opts.sessionHours ?? 12, secureCookie: opts.secureCookie ?? false }));
  app.use('/api', customerRouter({ store: opts.store, assistant: opts.assistant, clock }));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  if (opts.webDist && fs.existsSync(opts.webDist)) {
    app.use(express.static(opts.webDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(opts.webDist!, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    void _next;
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.reasons ? { reasons: err.reasons } : {}) });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'The request was not valid JSON.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  };
  app.use(onError);
  return app;
}
