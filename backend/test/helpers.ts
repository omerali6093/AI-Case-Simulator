import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp, type AppOptions } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { seedCases } from '../src/seed/seed.js';

export const ORIGIN = 'http://localhost:5173';

export interface TestEnv {
  app: ReturnType<typeof createApp>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
}

export async function startTestEnv(opts: AppOptions = { generalMax: 10_000, authMax: 10_000 }): Promise<TestEnv> {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Build indexes up front so unique constraints are enforced from the first request.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: mongod.getUri(),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
    CLIENT_ORIGIN: ORIGIN,
  } as NodeJS.ProcessEnv);
  const app = createApp(config, opts);
  await seedCases();
  return {
    app,
    stop: async () => {
      await mongoose.disconnect();
      await mongod.stop();
    },
    clear: async () => {
      await mongoose.models.User.deleteMany({});
      await mongoose.models.Consultation.deleteMany({});
      await mongoose.models.Progress.deleteMany({});
    },
  };
}

/** A supertest agent that keeps cookies, like a browser. */
export function browser(app: TestEnv['app']) {
  return request.agent(app).set('Origin', ORIGIN);
}

export async function signUp(app: TestEnv['app'], username = 'dr_test', password = 'correct-horse-9') {
  const agent = browser(app);
  const res = await agent.post('/api/auth/register').send({ username, password });
  return { agent, res };
}
