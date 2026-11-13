// Reads environment variables in one place.
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
  dbFile: process.env.DB_FILE ?? path.resolve(process.cwd(), 'data', 'cakeshop.sqlite'),
  bakerPassword: process.env.BAKER_PASSWORD ?? 'change-me',
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  // SEED_ON_START=true loads the demo orders when the database is empty.
  seedOnStart: process.env.SEED_ON_START === 'true',
  secureCookie: process.env.COOKIE_SECURE === 'true',
  // ASSISTANT_PROVIDER=fake uses the offline fake (demos and tests).
  // A real key is used only when it looks filled in (the .env.example placeholder is ignored).
  assistantProvider: process.env.ASSISTANT_PROVIDER,
  anthropicApiKey: /^sk-/.test(process.env.ANTHROPIC_API_KEY ?? '') ? (process.env.ANTHROPIC_API_KEY as string) : undefined,
};
