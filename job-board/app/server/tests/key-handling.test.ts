// Iteration 2 key handling: SEC-7 (the key never leaks) and SEC-11 (.env is git-ignored, the example holds no key).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/scoring/provider';
import { ACCOUNTS, createContext, signedIn } from './helpers';

const appDir = path.resolve(import.meta.dirname, '../..');
const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]{20,}/;

/** The real key from app/.env, if there is one (the test still works without it, using the key shape). */
function realKey(): string | undefined {
  const file = path.join(appDir, '.env');
  if (!fs.existsSync(file)) return undefined;
  const m = /^ANTHROPIC_API_KEY\s*=\s*(\S+)/m.exec(fs.readFileSync(file, 'utf8'));
  return m && /^sk-/.test(m[1]) ? m[1] : undefined;
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: appDir, encoding: 'utf8' });

describe('key handling', () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  beforeAll(async () => {
    ctx = await createContext({ scoring: new FakeProvider() });
    await ctx.reseed();
  });

  it('SEC-7 no response contains the key', async () => {
    const key = realKey();
    const agent = await signedIn(ctx.app, ACCOUNTS.seeker);
    await agent.put('/api/v1/me/profile').send({ body: 'React developer' });
    const bodies: string[] = [];
    for (const get of ['/api/health', '/api/v1/auth/me', '/api/v1/jobs', '/api/v1/me/profile', '/api/v1/me/applications']) {
      bodies.push(JSON.stringify((await agent.get(get)).body));
    }
    bodies.push(JSON.stringify((await agent.post('/api/v1/scoring').send({ jobIds: [1, 2] })).body));
    bodies.push(JSON.stringify((await agent.post('/api/v1/scoring').send({ jobIds: [] })).body));
    for (const body of bodies) {
      expect(body).not.toMatch(KEY_SHAPE);
      if (key) expect(body).not.toContain(key);
    }
  });

  it('SEC-7 the key is in no tracked or unignored file and not in the built web files', () => {
    const key = realKey();
    const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
    const dist = path.join(appDir, 'web/dist');
    const extra = fs.existsSync(dist)
      ? fs.readdirSync(dist, { recursive: true, encoding: 'utf8' }).map((f) => path.join('web/dist', f))
      : [];
    const leaks: string[] = [];
    for (const rel of [...files, ...extra]) {
      const file = path.join(appDir, rel);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size > 5_000_000) continue;
      const text = fs.readFileSync(file, 'latin1');
      if (KEY_SHAPE.test(text) || (key && text.includes(key))) leaks.push(rel);
    }
    expect(leaks).toEqual([]);
  });

  it('SEC-11 app/.env is git-ignored and .env.example holds no real key', () => {
    // exit code 0 = ignored; execFileSync throws otherwise
    expect(git('check-ignore', '.env').trim()).toBe('.env');
    const example = fs.readFileSync(path.join(appDir, '.env.example'), 'utf8');
    expect(example).not.toMatch(KEY_SHAPE);
    expect(example).toContain('ANTHROPIC_API_KEY');
  });
});
