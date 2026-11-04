// Phase C: the seeker's profile (UC-10). Test ids: TC-10-x, SEC-8.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNTS, anonymous, createContext, signedIn, type TestContext } from './helpers';

let reseed: () => Promise<void>;
let app: TestContext['app'];

beforeAll(async () => {
  const c = await createContext();
  reseed = c.reseed;
  app = c.app;
});
beforeEach(async () => {
  await reseed();
});

describe('UC-10 profile', () => {
  it('TC-10-2 seeker_without_profile_gets_empty_profile', async () => {
    const res = await (await signedIn(app, ACCOUNTS.seekerNoApps)).get('/api/v1/me/profile');
    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({ body: '', updatedAt: null });
  });

  it('TC-10-1 saving_then_reading_returns_the_same_text', async () => {
    const agent = await signedIn(app, ACCOUNTS.seeker);
    const body = '# Alex\n\n- React\n- 5 years\n';
    const put = await agent.put('/api/v1/me/profile').send({ body });
    expect(put.status).toBe(200);
    const got = await agent.get('/api/v1/me/profile');
    expect(got.body.profile.body).toBe(body);
    expect(got.body.profile.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('TC-10-2 saving_again_replaces_the_profile', async () => {
    const agent = await signedIn(app, ACCOUNTS.seeker);
    await agent.put('/api/v1/me/profile').send({ body: 'first' });
    await agent.put('/api/v1/me/profile').send({ body: 'second' });
    expect((await agent.get('/api/v1/me/profile')).body.profile.body).toBe('second');
  });

  it('TC-10-3 profiles_are_private_to_each_seeker', async () => {
    await (await signedIn(app, ACCOUNTS.seeker)).put('/api/v1/me/profile').send({ body: 'secret' });
    const other = await (await signedIn(app, ACCOUNTS.otherSeeker)).get('/api/v1/me/profile');
    expect(other.body.profile.body).toBe('');
  });

  it('TC-10-5 SEC-8 employer_cannot_read_or_save_a_profile', async () => {
    const agent = await signedIn(app, ACCOUNTS.employer);
    expect((await agent.get('/api/v1/me/profile')).status).toBe(403);
    expect((await agent.put('/api/v1/me/profile').send({ body: 'x' })).status).toBe(403);
  });

  it('TC-10-5 SEC-8 signed_out_visitor_gets_401', async () => {
    expect((await anonymous(app).get('/api/v1/me/profile')).status).toBe(401);
    expect((await anonymous(app).put('/api/v1/me/profile').send({ body: 'x' })).status).toBe(401);
  });

  it('TC-10-4 profile_over_20000_characters_is_rejected', async () => {
    const agent = await signedIn(app, ACCOUNTS.seeker);
    const res = await agent.put('/api/v1/me/profile').send({ body: 'a'.repeat(20001) });
    expect(res.status).toBe(422);
    expect((await agent.put('/api/v1/me/profile').send({ body: 'a'.repeat(20000) })).status).toBe(200);
  });

  it('TC-10-4 non_string_body_is_rejected', async () => {
    const agent = await signedIn(app, ACCOUNTS.seeker);
    for (const body of [{ body: 5 }, {}, { body: null }]) {
      const res = await agent.put('/api/v1/me/profile').send(body);
      expect(res.status).toBe(422);
      expect(res.body.error.fields.body).toBeTruthy();
    }
  });
});
