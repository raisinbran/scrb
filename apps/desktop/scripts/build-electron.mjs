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
