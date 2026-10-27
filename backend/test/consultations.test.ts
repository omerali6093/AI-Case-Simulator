import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { browser, signUp, startTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeAll(async () => {
  env = await startTestEnv();
});
afterAll(() => env.stop());
beforeEach(() => env.clear());

const uid = () => `req-${Math.random().toString(16).slice(2)}-${Date.now()}`;

describe('submitting a consultation', () => {
  it('requires a signed-in user', async () => {
    const res = await request(env.app).post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId: uid() });
    expect(res.status).toBe(401);
  });

  it('scores on the server and saves the record', async () => {
    const { agent } = await signUp(env.app);
    const res = await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId: uid() });
    expect(res.status).toBe(201);
    expect(res.body.record).toMatchObject({ caseId: 'case-cold', stepId: 'rest-fluids', score: 100, maxScore: 100, username: 'dr_test' });
    expect(res.body.record.feedback).toMatch(/well chosen/i);
    expect(res.body.progress).toMatchObject({ totalPoints: 100, completed: 1, level: 1 });
  });

  it('gives lower scores for weaker steps', async () => {
    const { agent } = await signUp(env.app);
    const res = await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'antibiotics', clientId: uid() });
    expect(res.body.record.score).toBe(30);
  });

  it('ignores any score the client tries to send', async () => {
    const { agent } = await signUp(env.app);
    const res = await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'emergency', clientId: uid(), score: 100 });
    expect(res.status).toBe(400); // unknown keys are rejected outright
    const ok = await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'emergency', clientId: uid() });
    expect(ok.body.record.score).toBe(15);
  });

  it('rejects unknown cases and steps from another case', async () => {
    const { agent } = await signUp(env.app);
    expect((await agent.post('/api/consultations').send({ caseId: 'case-fake', stepId: 'x', clientId: uid() })).status).toBe(404);
    expect((await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'not-a-step', clientId: uid() })).status).toBe(400);
  });

  it('rejects malformed ids and operator objects', async () => {
    const { agent } = await signUp(env.app);
    for (const body of [
      { caseId: { $ne: '' }, stepId: 'rest-fluids', clientId: uid() },
      { caseId: 'case-cold', stepId: 'rest-fluids', clientId: 'short' },
      { caseId: 'case cold!', stepId: 'rest-fluids', clientId: uid() },
    ]) {
      expect((await agent.post('/api/consultations').send(body)).status).toBe(400);
    }
  });

  it('is idempotent: a retried request does not score twice', async () => {
    const { agent } = await signUp(env.app);
    const clientId = uid();
    const first = await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId });
    const retry = await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.record.id).toBe(first.body.record.id);
    expect(retry.body.progress.totalPoints).toBe(100);
    const history = await agent.get('/api/consultations');
    expect(history.body.records).toHaveLength(1);
  });

  it('handles two identical requests arriving at once', async () => {
    const { agent } = await signUp(env.app);
    const clientId = uid();
    const body = { caseId: 'case-cold', stepId: 'rest-fluids', clientId };
    const [a, b] = await Promise.all([agent.post('/api/consultations').send(body), agent.post('/api/consultations').send(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect((await agent.get('/api/progress')).body.progress.completed).toBe(1);
  });

  it('refuses to reuse a request id for a different choice', async () => {
    const { agent } = await signUp(env.app);
    const clientId = uid();
    await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId });
    const res = await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'antibiotics', clientId });
    expect(res.status).toBe(409);
  });
});

describe('history and progression', () => {
  it('lists the newest first and paginates', async () => {
    const { agent } = await signUp(env.app);
    for (const stepId of ['rest-fluids', 'antibiotics', 'emergency']) {
      await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId, clientId: uid() });
    }
    const all = await agent.get('/api/consultations');
    expect(all.body.records.map((r: { stepId: string }) => r.stepId)).toEqual(['emergency', 'antibiotics', 'rest-fluids']);
    const page = await agent.get('/api/consultations?limit=2&page=2');
    expect(page.body.records).toHaveLength(1);
  });

  it('rejects bad paging parameters', async () => {
    const { agent } = await signUp(env.app);
    expect((await agent.get('/api/consultations?limit=9999')).status).toBe(400);
    expect((await agent.get('/api/consultations?limit[$gt]=1')).status).toBe(400);
  });

  it("never shows one player another player's records", async () => {
    const a = await signUp(env.app, 'doctor_a');
    const b = await signUp(env.app, 'doctor_b');
    await a.agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId: uid() });
    expect((await b.agent.get('/api/consultations')).body.records).toHaveLength(0);
    expect((await b.agent.get('/api/progress')).body.progress.totalPoints).toBe(0);
  });

  it('levels up every 250 points', async () => {
    const { agent } = await signUp(env.app);
    for (let i = 0; i < 3; i++) await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId: uid() });
    const res = await agent.get('/api/progress');
    expect(res.body.progress).toMatchObject({ totalPoints: 300, completed: 3, level: 2, averageScore: 100 });
  });

  it('offers cases in rotation, one more per finished consultation, without the answer key', async () => {
    const { agent } = await signUp(env.app);
    const first = await agent.get('/api/cases/next');
    expect(first.status).toBe(200);
    expect(first.body.case).toMatchObject({ id: 'case-cold', name: 'Sara Khan' });
    expect(first.body.case.qs).toHaveLength(4);
    expect(first.body.case.steps.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(first.body)).not.toMatch(/points|feedback|educationalNote/);

    await agent.post('/api/consultations').send({ caseId: 'case-cold', stepId: 'rest-fluids', clientId: uid() });
    expect((await agent.get('/api/cases/next')).body.case.id).toBe('case-headache');
    await agent.post('/api/consultations').send({ caseId: 'case-headache', stepId: 'lifestyle-followup', clientId: uid() });
    await agent.post('/api/consultations').send({ caseId: 'case-ankle', stepId: 'rice-review', clientId: uid() });
    expect((await agent.get('/api/cases/next')).body.case.id).toBe('case-cold');
  });

  it('requires sign-in for cases', async () => {
    expect((await browser(env.app).get('/api/cases/next')).status).toBe(401);
    expect((await browser(env.app).get('/api/cases')).status).toBe(401);
  });
});

describe('static frontend', () => {
  it('serves the game page and keeps unknown /api paths as JSON 404s', async () => {
    const page = await request(env.app).get('/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('<title>Clinic Simulator</title>');
    const missing = await request(env.app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toMatch(/json/);
  });
});
