import { build } from 'esbuild';
await build({
  entryPoints: { printPdf: 'src/main/exports.ts' },
  outdir: 'e2e',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
  write: false,
}).then(async (result) => {
  const { writeFile } = await import('node:fs/promises');
  await writeFile('e2e/pdf-printer-test-bundle.cjs', result.outputFiles[0].contents);
});
