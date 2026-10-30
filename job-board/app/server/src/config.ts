// Reads environment variables in one place (T-8: configuration comes from the environment).
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbFile: process.env.DB_FILE ?? path.resolve(process.cwd(), 'data', 'jobboard.sqlite'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 7),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  // SEED_ON_START=true loads the demo data when the database is empty (used by the Docker demo).
  seedOnStart: process.env.SEED_ON_START === 'true',
  production: process.env.NODE_ENV === 'production',
  // Set COOKIE_SECURE=true when the site is served over HTTPS.
  secureCookie: process.env.COOKIE_SECURE === 'true',
};
