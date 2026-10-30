import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: { name: 'desktop', environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
