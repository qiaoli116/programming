// Reads environment variables in one place (T-8: configuration comes from the environment).
import fs from 'node:fs';
import path from 'node:path';

// Load app/.env (git-ignored) into the environment without overriding values that are already set.
// Looked for in the working directory and one level up, because npm runs the server from app/server.
for (const dir of [process.cwd(), path.resolve(process.cwd(), '..')]) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  break;
}

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
  // Match scoring (iteration 2). SCORING_PROVIDER=fake uses the offline fake (demos and browser tests).
  // A real key is used only when it looks filled in (the .env.example placeholder is ignored).
  anthropicApiKey: /^sk-/.test(process.env.ANTHROPIC_API_KEY ?? '') ? (process.env.ANTHROPIC_API_KEY as string) : undefined,
  scoringProvider: process.env.SCORING_PROVIDER,
};
