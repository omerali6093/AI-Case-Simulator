import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { browser, signUp, startTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeAll(async () => {
  env = await startTestEnv();
});
afterAll(() => env.stop());
beforeEach(() => env.clear());

describe('registration', () => {
  it('creates an account and sets an httpOnly session cookie', async () => {
    const { res } = await signUp(env.app);
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('dr_test');
    expect(res.body.progress).toMatchObject({ totalPoints: 0, level: 1, completed: 0 });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('never returns the password or its hash', async () => {
    const { res } = await signUp(env.app);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('rejects a duplicate name regardless of case', async () => {
    await signUp(env.app, 'Dr_Ann');
    const { res } = await signUp(env.app, 'dr_ann');
    expect(res.status).toBe(409);
  });

  it.each([
    [{ username: 'ab', password: 'longenough1' }, /3-24/],
    [{ username: 'bad name!', password: 'longenough1' }, /letters, numbers/],
    [{ username: 'dr_ok', password: 'short' }, /at least 8/],
    [{ username: 'dr_ok', password: 'longenough1', admin: true }, undefined],
    [{ username: { $gt: '' }, password: 'longenough1' }, undefined],
  ])('rejects invalid input %j', async (body, message) => {
    const res = await browser(env.app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    if (message) expect(res.body.error.message).toMatch(message);
  });
});

describe('login and sessions', () => {
  it('logs in with the right password and reads /me from the cookie', async () => {
    await signUp(env.app);
    const agent = browser(env.app);
    const login = await agent.post('/api/auth/login').send({ username: 'DR_TEST', password: 'correct-horse-9' });
    expect(login.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('dr_test');
  });

  it('gives the same error for a wrong password and an unknown user', async () => {
    await signUp(env.app);
    const wrong = await browser(env.app).post('/api/auth/login').send({ username: 'dr_test', password: 'nope-nope-nope' });
    const unknown = await browser(env.app).post('/api/auth/login').send({ username: 'nobody_here', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses a NoSQL operator in the login body', async () => {
    await signUp(env.app);
    const res = await browser(env.app).post('/api/auth/login').send({ username: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('requires a session for /me', async () => {
    expect((await request(env.app).get('/api/auth/me')).status).toBe(401);
  });

  it('rejects a forged or tampered cookie', async () => {
    const res = await request(env.app).get('/api/auth/me').set('Cookie', 'clinic_session=not.a.token');
    expect(res.status).toBe(401);
  });

  it('logout revokes the token even if someone kept a copy', async () => {
    const { agent, res } = await signUp(env.app);
    const saved = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    const replay = await request(env.app).get('/api/auth/me').set('Cookie', saved);
    expect(replay.status).toBe(401);
  });
});

describe('request hardening', () => {
  it('blocks state-changing requests from another origin', async () => {
    const res = await request(env.app)
      .post('/api/auth/register')
      .set('Origin', 'https://evil.example')
      .send({ username: 'dr_evil', password: 'longenough1' });
    expect(res.status).toBe(403);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(env.app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self' https://cdn.jsdelivr.net");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('rejects malformed JSON and oversized bodies with clean errors', async () => {
    const bad = await browser(env.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/JSON/);
    const big = await browser(env.app).post('/api/auth/login').send({ username: 'a', password: 'x'.repeat(20_000) });
    expect(big.status).toBe(413);
  });

  it('returns JSON 404s', async () => {
    const res = await request(env.app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBeDefined();
  });
});
