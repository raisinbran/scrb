import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Build only: the dev server needs inline scripts and a websocket for hot reload. */
function addContentSecurityPolicy(): Plugin {
  return {
    name: 'scrb-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), addContentSecurityPolicy()],
  base: './',
  server: { port: 5183, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
