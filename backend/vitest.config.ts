import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
