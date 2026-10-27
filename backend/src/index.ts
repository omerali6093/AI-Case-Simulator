import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { seedCases } from './seed/seed.js';

const config = loadConfig();
mongoose.set('strictQuery', true);
await mongoose.connect(config.MONGODB_URI);
await seedCases();

const app = createApp(config);
const server = app.listen(config.PORT, () => {
  console.log(`Clinic API listening on :${config.PORT} (${config.NODE_ENV})`);
});

function shutdown(): void {
  server.close(() => {
    void mongoose.disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
