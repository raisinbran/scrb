#!/usr/bin/env node
// Copies the eight tools and every dynamic library they load into <out>/bin and <out>/bin/lib,
// points them at each other, and fails if anything still refers outside the bundle or the system.
// Usage: node scripts/stage-mac-tools.mjs <out> <capture> <whisper-bin-dir> <tools-dir> <llama-bin-dir> <extra-lib-dir>...
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';

const [out, capture, whisperDir, toolsDir, llamaDir, ...extraLibDirs] = process.argv.slice(2);
if (!out || !capture || !whisperDir || !toolsDir || !llamaDir) {
  console.error(
    'usage: stage-mac-tools.mjs <out> <capture> <whisper-bin-dir> <tools-dir> <llama-bin-dir> [lib-dir...]',
  );
  process.exit(2);
}
const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const isSystem = (p) => p.startsWith('/usr/lib/') || p.startsWith('/System/');

const tools = {
  'scrb-capture': capture,
  'whisper-cli': path.join(whisperDir, 'whisper-cli'),
  'whisper-server': path.join(whisperDir, 'whisper-server'),
  'whisper-vad-speech-segments': path.join(whisperDir, 'whisper-vad-speech-segments'),
  'scrb-sherpa': path.join(toolsDir, 'scrb-sherpa'),
  ffmpeg: path.join(toolsDir, 'ffmpeg'),
  ffprobe: path.join(toolsDir, 'ffprobe'),
  'llama-server': path.join(llamaDir, 'llama-server'),
};

const bin = path.join(out, 'bin');
const lib = path.join(bin, 'lib');
rmSync(out, { recursive: true, force: true });
mkdirSync(lib, { recursive: true });

const deps = (file) =>
  run('otool', ['-L', file])
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(' (')[0])
    .filter(Boolean);
const rpaths = (file) =>
  [
    ...run('otool', ['-l', file]).matchAll(/cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+?) \(offset/g),
  ].map((m) => m[1]);

function locate(ref, from) {
  const name = path.basename(ref);
  const dirs = [path.dirname(from), ...rpaths(from), llamaDir, ...extraLibDirs, whisperDir];
  if (path.isAbsolute(ref) && existsSync(ref)) return ref;
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot find ${ref} needed by ${from}`);
}

const libs = new Map(); // canonical source path -> staged library
const namesByBase = new Map(); // source basename -> content hash -> staged library
const dependencyTargets = new Map(); // canonical source path -> staged targets for each dependency
const queue = [];
for (const [name, src] of Object.entries(tools)) {
  if (!existsSync(src)) throw new Error(`missing tool ${name}: ${src}`);
  copyFileSync(src, path.join(bin, name));
  queue.push({ file: src });
}
while (queue.length > 0) {
  const { file } = queue.shift();
  const source = realpathSync(file);
  for (const ref of deps(file)) {
    if (isSystem(ref)) continue;
    const found = locate(ref, file);
    const base = path.basename(ref);
    const resolved = realpathSync(found);
    let byHash = namesByBase.get(base);
    if (!byHash) {
      byHash = new Map();
      namesByBase.set(base, byHash);
    }
    // Different toolchains can require incompatible dylibs with the same install-name basename.
    const hash = createHash('sha256').update(readFileSync(resolved)).digest('hex').slice(0, 12);
    let stagedLibrary = libs.get(resolved) ?? byHash.get(hash);
    if (!stagedLibrary) {
      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      const stagedName = byHash.size === 0 ? base : `${stem}-${hash}${ext}`;
      stagedLibrary = { file: resolved, name: stagedName };
      copyFileSync(resolved, path.join(lib, stagedName));
      queue.push({ file: resolved });
    }
    byHash.set(hash, stagedLibrary);
    libs.set(resolved, stagedLibrary);
    const edges = dependencyTargets.get(source) ?? [];
    edges.push({ ref, name: stagedLibrary.name });
    dependencyTargets.set(source, edges);
  }
}

// Rewrite names and search paths in the copies.
const fix = (source, staged, rpath, library = false) => {
  for (const r of rpaths(staged)) run('install_name_tool', ['-delete_rpath', r, staged]);
  run('install_name_tool', ['-add_rpath', rpath, staged]);
  for (const { ref, name } of dependencyTargets.get(realpathSync(source)) ?? []) {
    const target = `@rpath/${name}`;
    if (!isSystem(ref) && ref !== target)
      run('install_name_tool', ['-change', ref, target, staged]);
  }
  if (library) run('install_name_tool', ['-id', `@rpath/${path.basename(staged)}`, staged]);
};
for (const [name, source] of Object.entries(tools))
  fix(source, path.join(bin, name), '@loader_path/lib');
for (const { file, name } of new Set(libs.values())) {
  const staged = path.join(lib, name);
  fix(file, staged, '@loader_path', true);
}
for (const file of [
  ...Object.keys(tools).map((n) => path.join(bin, n)),
  ...readdirSync(lib).map((n) => path.join(lib, n)),
])
  run('codesign', ['--force', '--sign', '-', file]);

// Nothing may still point at a development folder, and every @rpath name must resolve.
const problems = [];
for (const file of [
  ...Object.keys(tools).map((n) => path.join(bin, n)),
  ...readdirSync(lib).map((n) => path.join(lib, n)),
]) {
  const paths = rpaths(file);
  for (const r of paths) if (!r.startsWith('@loader_path')) problems.push(`${file}: rpath ${r}`);
  for (const ref of deps(file)) {
    if (isSystem(ref) || path.basename(ref) === path.basename(file)) continue;
    if (!ref.startsWith('@rpath/') || !existsSync(path.join(lib, path.basename(ref))))
      problems.push(`${file}: ${ref}`);
  }
}
if (problems.length > 0) {
  console.error(`References outside the bundle:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Staged ${Object.keys(tools).length} tools and ${libs.size} libraries in ${bin}`);
