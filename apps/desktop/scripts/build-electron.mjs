import { build } from 'esbuild';

// Sandboxed preload scripts must be a single CommonJS file, so both processes are bundled.
await build({
  entryPoints: { main: 'src/main/main.ts', preload: 'src/preload/preload.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
});

await build({
  entryPoints: { liveWorkerEntry: '../../packages/transcription/src/liveWorkerEntry.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
});

// The DOCX builder runs in a worker thread; `docx` is bundled into it.
await build({
  entryPoints: { exportWorkerEntry: 'src/main/exportWorkerEntry.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
});
