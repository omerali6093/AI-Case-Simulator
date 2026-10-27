import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browser, startTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeAll(async () => {
  env = await startTestEnv({ generalMax: 10_000, authMax: 3 });
});
afterAll(() => env.stop());

describe('rate limiting', () => {
  it('locks out repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await browser(env.app).post('/api/auth/login').send({ username: 'dr_test', password: 'wrong-wrong' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});
