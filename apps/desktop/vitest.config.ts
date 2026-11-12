import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Main-process tests do real file and SQLite work; on windows-latest a test can pass 5 s (storage's library tests run ~15x slower than on the Mac).
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'desktop',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
  },
});
