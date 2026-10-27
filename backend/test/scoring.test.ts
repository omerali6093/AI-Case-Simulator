import { describe, expect, it } from 'vitest';
import { levelFor, summarise } from '../src/lib/scoring.js';
import { readSeedCases } from '../src/seed/seed.js';
import { loadConfig } from '../src/config.js';

describe('scoring helpers', () => {
  it('levels up every 250 points', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(249)).toBe(1);
    expect(levelFor(250)).toBe(2);
    expect(levelFor(-5)).toBe(1);
  });

  it('averages to one decimal and handles no consultations', () => {
    expect(summarise(0, 0).averageScore).toBe(0);
    expect(summarise(200, 3).averageScore).toBe(66.7);
  });
});

describe('seed data', () => {
  const cases = readSeedCases();

  it('has three fictional cases with unique ids', () => {
    expect(cases).toHaveLength(3);
    expect(new Set(cases.map((c) => c.caseId)).size).toBe(3);
  });

  it('has four interview questions, a complaint and a look for every case', () => {
    for (const c of cases) {
      expect(c.questions).toHaveLength(4);
      expect(c.complaint.length).toBeGreaterThan(10);
      expect(c.look).toHaveProperty('skin');
    }
    expect(cases.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('gives every case exactly one best step worth 100 and sane points', () => {
    for (const c of cases) {
      expect(c.steps.filter((s) => s.points === 100)).toHaveLength(1);
      expect(c.steps.every((s) => s.points >= 0 && s.points <= 100)).toBe(true);
      expect(new Set(c.steps.map((s) => s.id)).size).toBe(c.steps.length);
    }
  });
});

describe('config', () => {
  const base = { MONGODB_URI: 'mongodb://x/y', CLIENT_ORIGIN: 'http://localhost:5173' };

  it('refuses a short JWT secret', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });

  it('uses secure cookies in production', () => {
    const cfg = loadConfig({ ...base, JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(cfg.cookieSecure).toBe(true);
  });

  it('refuses SameSite=None over plain http in production', () => {
    expect(() =>
      loadConfig({ ...base, JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'production', COOKIE_SAMESITE: 'none' } as NodeJS.ProcessEnv),
    ).toThrow(/https/);
  });
});
