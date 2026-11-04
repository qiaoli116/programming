import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Knex } from 'knex';
import { errorHandler, loadUser, notFoundHandler } from './middleware';
import { createRepos } from './repositories';
import { createApiRouter } from './routes';
import type { ScoringProvider } from './scoring/provider';
import { createServices } from './services';

export interface AppOptions {
  db: Knex;
  sessionDays?: number;
  secureCookie?: boolean;
  /** Folder with the built React app. When it exists, Express serves it (single-image deployment, T-8). */
  webDist?: string;
  /** The AI used by match scoring. Omit it and scoring answers 503. */
  scoring?: ScoringProvider;
  scoringTimeoutMs?: number;
}

export function createApp({ db, sessionDays = 7, secureCookie = false, webDist, scoring, scoringTimeoutMs }: AppOptions) {
  const services = createServices(createRepos(db), { sessionDays, scoring, scoringTimeoutMs });
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/v1', loadUser(services), createApiRouter(services, { secureCookie }), notFoundHandler);

  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist));
    // Any other GET is a React Router page; the browser app decides what to show.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
