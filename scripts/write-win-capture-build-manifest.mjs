#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureBuildManifest, gitHead } from './stage-win-tools.mjs';

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error(`invalid argument: ${name}`);
    values[name.slice(2)] = path.resolve(value);
  }
  return values;
}

function requiredPath(values, name) {
  const value = values[name];
  if (!value || !existsSync(value)) throw new Error(`missing --${name} path`);
  return value;
}

function main() {
  const values = parseArguments(process.argv.slice(2));
  const repo = requiredPath(values, 'repo');
  const captureBinary = requiredPath(values, 'capture-bin');
  const captureSource = requiredPath(values, 'capture-source');
  const buildScript = requiredPath(values, 'build-script');
  const opusSource = requiredPath(values, 'opus-source');
  const opusLibrary = requiredPath(values, 'opus-lib');
  if (!values.out) throw new Error('missing --out path');
  const output = path.dirname(values.out);
  const sourceFileCommit = execFileSync(
    'git',
    ['-C', repo, 'log', '-1', '--format=%H', '--', 'native/windows-capture/src/main.cpp'],
    { encoding: 'utf8' },
  ).trim();
  const manifest = createCaptureBuildManifest({
    repositoryHead: gitHead(repo),
    sourceFileCommit,
    captureBinary,
    captureSource,
    buildScript,
    opusSourceCommit: gitHead(opusSource),
    opusLibrary,
  });
  mkdirSync(output, { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote capture build manifest for ${captureBinary}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
