import { defineConfig } from 'vitest/config';

// Serialize storage test files: parallel execution significantly slows them on Windows CI.
export default defineConfig({
  test: { name: 'storage', include: ['test/**/*.test.ts'], fileParallelism: false },
});
