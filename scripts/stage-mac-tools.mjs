#!/usr/bin/env node
// Copies the seven tools and every dynamic library they load into <out>/bin and <out>/bin/lib,
// points them at each other, and fails if anything still refers outside the bundle or the system.
// Usage: node scripts/stage-mac-tools.mjs <out> <capture> <whisper-bin-dir> <tools-dir> <extra-lib-dir>...
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const [out, capture, whisperDir, toolsDir, ...extraLibDirs] = process.argv.slice(2);
if (!out || !capture || !whisperDir || !toolsDir) {
  console.error('usage: stage-mac-tools.mjs <out> <capture> <whisper-bin-dir> <tools-dir> [lib-dir...]');
  process.exit(2);
}
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const isSystem = (p) => p.startsWith('/usr/lib/') || p.startsWith('/System/');

const tools = {
  'scrb-capture': capture,
  'whisper-cli': path.join(whisperDir, 'whisper-cli'),
  'whisper-server': path.join(whisperDir, 'whisper-server'),
  'whisper-vad-speech-segments': path.join(whisperDir, 'whisper-vad-speech-segments'),
  'scrb-sherpa': path.join(toolsDir, 'scrb-sherpa'),
  ffmpeg: path.join(toolsDir, 'ffmpeg'),
  ffprobe: path.join(toolsDir, 'ffprobe'),
};

const bin = path.join(out, 'bin');
const lib = path.join(bin, 'lib');
rmSync(out, { recursive: true, force: true });
mkdirSync(lib, { recursive: true });

const deps = (file) =>
  run('otool', ['-L', file]).split('\n').slice(1).map((l) => l.trim().split(' (')[0]).filter(Boolean);
const rpaths = (file) =>
  [...run('otool', ['-l', file]).matchAll(/cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+?) \(offset/g)].map((m) => m[1]);

function locate(ref, from) {
  const name = path.basename(ref);
  const dirs = [path.dirname(from), ...rpaths(from), ...extraLibDirs, whisperDir];
  if (path.isAbsolute(ref) && existsSync(ref)) return ref;
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot find ${ref} needed by ${from}`);
}

const libs = new Map(); // base name -> source path
const queue = [];
for (const [name, src] of Object.entries(tools)) {
  if (!existsSync(src)) throw new Error(`missing tool ${name}: ${src}`);
  copyFileSync(src, path.join(bin, name));
  queue.push({ file: src, staged: path.join(bin, name), exe: true });
}
while (queue.length > 0) {
  const { file } = queue.shift();
  for (const ref of deps(file)) {
    if (isSystem(ref)) continue;
    const found = locate(ref, file);
    const base = path.basename(ref);
    if (libs.has(base)) continue;
    libs.set(base, found);
    copyFileSync(found, path.join(lib, base));
    queue.push({ file: found, staged: path.join(lib, base), exe: false });
  }
}

// Rewrite names and search paths in the copies.
const fix = (staged, rpath) => {
  for (const r of rpaths(staged)) run('install_name_tool', ['-delete_rpath', r, staged]);
  run('install_name_tool', ['-add_rpath', rpath, staged]);
  for (const ref of deps(staged)) {
    if (isSystem(ref) || ref.startsWith('@rpath/')) continue;
    run('install_name_tool', ['-change', ref, `@rpath/${path.basename(ref)}`, staged]);
  }
};
for (const name of Object.keys(tools)) fix(path.join(bin, name), '@loader_path/lib');
for (const base of libs.keys()) {
  const staged = path.join(lib, base);
  fix(staged, '@loader_path');
  run('install_name_tool', ['-id', `@rpath/${base}`, staged]);
}
for (const file of [...Object.keys(tools).map((n) => path.join(bin, n)), ...readdirSync(lib).map((n) => path.join(lib, n))])
  run('codesign', ['--force', '--sign', '-', file]);

// Nothing may still point at a development folder, and every @rpath name must resolve.
const problems = [];
for (const file of [...Object.keys(tools).map((n) => path.join(bin, n)), ...readdirSync(lib).map((n) => path.join(lib, n))]) {
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
