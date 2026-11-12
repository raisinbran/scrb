import { defineConfig } from 'vitest/config';

// Serialize storage test files: parallel execution significantly slows them on Windows CI.
// Real file and SQLite work on windows-latest can pass 5 s per test (the file takes ~26 s there vs ~2 s on the Mac).
export default defineConfig({
  test: {
    name: 'storage',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
