import { defineConfig } from 'vitest/config';

// Run in parallel, storage files slow each other enough that single tests exceeded the 5 s limit on Windows CI.
export default defineConfig({
  test: { name: 'storage', include: ['test/**/*.test.ts'], fileParallelism: false },
});
