import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const [candidate, dependencies, output] = process.argv.slice(2).map((p) => path.resolve(p));
if (fs.existsSync(output)) throw new Error('Build report exists; no automatic repeat');
const desktop = path.join(candidate, 'apps/desktop');
const desktopDependencies = path.resolve(dependencies, '../apps/desktop/node_modules');
if (!fs.existsSync(path.join(desktopDependencies, '@vitejs/plugin-react/package.json')))
  throw new Error('Installed desktop dependencies unavailable');
if (!fs.existsSync(path.join(desktop, 'node_modules')))
  fs.symlinkSync(desktopDependencies, path.join(desktop, 'node_modules'), 'junction');
const alias = {};
for (const name of fs.readdirSync(path.join(candidate, 'packages'))) {
  const entry = path.join(candidate, 'packages', name, 'src/index.ts');
  if (fs.existsSync(entry)) alias[`@scrb/${name}`] = entry;
}
const { build } = await import(pathToFileURL(path.join(dependencies, 'esbuild/lib/main.js')));
const { build: buildVite } = await import(
  pathToFileURL(path.join(dependencies, 'vite/dist/node/index.js'))
);
await buildVite({ root: desktop, configLoader: 'native', resolve: { alias } });
const common = {
  absWorkingDir: desktop,
  tsconfig: path.join(desktop, 'tsconfig.json'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  logLevel: 'warning',
  alias,
  metafile: true,
};
const main = await build({
  ...common,
  entryPoints: { main: 'src/main/main.ts', preload: 'src/preload/preload.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  format: 'cjs',
  external: ['electron'],
});
const worker = await build({
  ...common,
  entryPoints: { liveWorkerEntry: '../../packages/transcription/src/liveWorkerEntry.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.mjs' },
  format: 'esm',
});
const inputs = [...Object.keys(main.metafile.inputs), ...Object.keys(worker.metafile.inputs)];
const wrong = inputs.filter(
  (file) =>
    file.includes('/packages/') && !path.resolve(desktop, file).startsWith(candidate + path.sep),
);
if (wrong.length) throw new Error('Noncandidate workspace input');
const hashes = Object.fromEntries(
  ['main.cjs', 'preload.cjs', 'liveWorkerEntry.mjs'].map((name) => [
    name,
    createHash('sha256')
      .update(fs.readFileSync(path.join(desktop, 'dist-electron', name)))
      .digest('hex'),
  ]),
);
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      candidate: '553dd9080f452f8a54ccff5cd5fea8d6937438ae',
      time: new Date().toISOString(),
      source: 'git archive of pinned commit; no source edits',
      installedDependenciesReused: true,
      candidateWorkspaceInputs: true,
      hashes,
      main: main.metafile,
      worker: worker.metafile,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(JSON.stringify({ candidateWorkspaceInputs: true, hashes }));
