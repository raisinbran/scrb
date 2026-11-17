#!/usr/bin/env node
// Stage the six non-capture Windows runtime tools, their non-system DLL closure,
// license texts, and a hash/provenance report into electron-builder's bin folder.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const REQUIRED_TOOLS = [
  'whisper-cli.exe',
  'whisper-server.exe',
  'whisper-vad-speech-segments.exe',
  'scrb-sherpa.exe',
  'ffmpeg.exe',
  'ffprobe.exe',
];

export const PINNED_INPUT_HASHES = {
  'ffmpeg.exe': 'e41cab268e561618eacd9b9190134464f87eded52327bdb0d2a4576b220ec030',
  'ffprobe.exe': '513f4f5071c162eb9e2084008a9345b67a47067ea12a2c1ae75ecd489d369506',
  'onnxruntime.dll': '422d776ab0e3218260f7f628fcb84606aaa5c21116f720c8619a6da5e0b2e0f9',
  'onnxruntime_providers_shared.dll':
    '0190137dee4933261c065c5d030c3568a68c7aa43cad942b4726a07011738bc2',
  'sherpa-onnx-c-api.dll': '71728fb12b3a15a9ab7c4961fceafc6dd802f7fc038f461f5ea59e07d7104bec',
};

export const PINNED_MSVC_RUNTIME_HASHES = {
  'msvcp140.dll': '0f885b509a685d2bbfa652fed26b5fb31d88fbdab0a978c641d1c7b8aa460aa9',
  'msvcp140_1.dll': 'bfad5aef4c63a669e3c140655cdfdf395b6c979b400a447bd5dcb65ed8826c3d',
  'vcomp140.dll': '55aba23cdcd6484fbb06f4155b8ca75adfce7a881f10afd0c49457165e677164',
  'vcruntime140.dll': 'd5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066',
  'vcruntime140_1.dll': '1f2d41c4aa5db0bc33ebf7b66d72943a817d7ce6cbe880502a9403823633093f',
};

export const SHERPA_RELEASE_SHA256 =
  '11fd6a50b97eed38b54fb16d8219f49b16aa7f6a8e43a042316469ef47652e82';
export const WHISPER_COMMIT = '284029c07012d2000941a08d38a31ffb71f4734e';
export const SHERPA_COMMIT = 'af2d8d81dbfa61c4cea4c568da78f3982edca005';

const MSVC_RUNTIME = /^(msvcp|vcruntime|vcomp)\d.*\.dll$/i;
const API_SET = /^(api|ext)-ms-win-.*\.dll$/i;

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const key = (name) => name.toLowerCase();

export function parseDumpbinDependencies(output) {
  return [...output.matchAll(/^\s*([\w.+-]+\.dll)\s*$/gim)].map((match) => match[1]);
}

function findFile(name, directories) {
  for (const directory of directories) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    if (existsSync(directory)) {
      const caseInsensitiveMatch = readdirSync(directory).find((entry) => key(entry) === key(name));
      if (caseInsensitiveMatch) {
        const matchedPath = path.join(directory, caseInsensitiveMatch);
        if (statSync(matchedPath).isFile()) return matchedPath;
      }
    }
  }
  return undefined;
}

function systemDependency(name, system32Path) {
  return API_SET.test(name) || Boolean(findFile(name, [system32Path]));
}

function copyWithoutCollision(source, destination, sourcesByName) {
  const basename = path.basename(source);
  const hash = digest(source);
  const prior = sourcesByName.get(key(basename));
  if (prior && prior.hash !== hash) {
    throw new Error(`conflicting DLLs named ${basename}: ${prior.source} and ${source}`);
  }
  sourcesByName.set(key(basename), { source, hash });
  if (existsSync(destination)) {
    if (digest(destination) !== hash) throw new Error(`staged file collision: ${destination}`);
  } else {
    copyFileSync(source, destination);
  }
  return hash;
}

export function stageWindowsTools({
  outputDir,
  toolSources,
  sourceDirectories,
  system32Path,
  inspectDependencies,
  pinnedRuntimeHashes = {},
  additionalFiles = [],
  verifyTools,
  provenance,
  noticesPath,
  licensesDirectory,
}) {
  for (const name of REQUIRED_TOOLS) {
    const source = toolSources[name];
    if (!source || !existsSync(source) || !statSync(source).isFile()) {
      throw new Error(`missing required tool ${name}: ${source ?? '(no source path)'}`);
    }
  }
  if (!system32Path) throw new Error('System32 directory is required for DLL classification');
  if (!outputDir) throw new Error('output directory is required');

  const out = path.resolve(outputDir);
  if (existsSync(out) && readdirSync(out).length > 0) {
    throw new Error(`refusing to overwrite non-empty staging directory: ${out}`);
  }
  mkdirSync(out, { recursive: true });

  const searchDirs = [...new Set(sourceDirectories.map((dir) => path.resolve(dir)))];
  const sourceByName = new Map();
  const queue = [];
  const edges = [];
  const systemDlls = new Set();

  for (const name of REQUIRED_TOOLS) {
    const source = path.resolve(toolSources[name]);
    const destination = path.join(out, name);
    const hash = copyWithoutCollision(source, destination, sourceByName);
    queue.push({ name, source, destination, hash, executable: true });
  }
  for (const source of additionalFiles) {
    if (!existsSync(source) || !statSync(source).isFile()) {
      throw new Error(`missing required runtime DLL: ${source}`);
    }
    const destination = path.join(out, path.basename(source));
    const hash = copyWithoutCollision(source, destination, sourceByName);
    queue.push({ name: path.basename(source), source, destination, hash, executable: false });
  }

  const visited = new Set();
  while (queue.length > 0) {
    const item = queue.shift();
    const identity = `${key(path.basename(item.destination))}:${item.hash}`;
    if (visited.has(identity)) continue;
    visited.add(identity);

    for (const dependency of inspectDependencies(item.source)) {
      const dependencyKey = key(dependency);
      if (API_SET.test(dependency)) {
        systemDlls.add(dependency);
        edges.push({
          from: path.basename(item.destination),
          dependency,
          resolution: 'Windows API set',
        });
        continue;
      }

      const existing = readdirSync(out).find((name) => key(name) === dependencyKey);
      if (existing) {
        const staged = path.join(out, existing);
        const sourceRecord = sourceByName.get(dependencyKey);
        if (sourceRecord && digest(staged) !== sourceRecord.hash) {
          throw new Error(`staged DLL hash changed during dependency walk: ${existing}`);
        }
        edges.push({
          from: path.basename(item.destination),
          dependency,
          resolution: 'bundle',
          stagedAs: existing,
        });
        if (!visited.has(`${dependencyKey}:${digest(staged)}`)) {
          queue.push({
            name: existing,
            source: staged,
            destination: staged,
            hash: digest(staged),
            executable: false,
          });
        }
        continue;
      }

      const source = findFile(dependency, searchDirs);
      if (!source) {
        if (!MSVC_RUNTIME.test(dependency) && systemDependency(dependency, system32Path)) {
          systemDlls.add(dependency);
          edges.push({ from: path.basename(item.destination), dependency, resolution: 'System32' });
          continue;
        }
        throw new Error(
          `cannot locate non-system dependency ${dependency} needed by ${item.source}`,
        );
      }

      if (MSVC_RUNTIME.test(dependency)) {
        const expectedHash = pinnedRuntimeHashes[dependencyKey];
        if (!expectedHash) {
          throw new Error(`MSVC runtime dependency has no pinned hash: ${dependency}`);
        }
        const actualHash = digest(source);
        if (actualHash !== expectedHash) {
          throw new Error(
            `MSVC runtime hash mismatch for ${dependency}: expected ${expectedHash}, got ${actualHash}`,
          );
        }
      }

      const destination = path.join(out, dependency);
      const hash = copyWithoutCollision(source, destination, sourceByName);
      edges.push({
        from: path.basename(item.destination),
        dependency,
        resolution: 'bundle',
        stagedAs: dependency,
      });
      queue.push({ name: dependency, source, destination, hash, executable: false });
    }
  }

  const files = readdirSync(out)
    .filter((name) => /\.(exe|dll)$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, sha256: digest(path.join(out, name)) }));
  const licenseOut = path.join(out, 'licenses');
  mkdirSync(licenseOut);
  if (!existsSync(noticesPath)) throw new Error(`missing third-party notices: ${noticesPath}`);
  copyFileSync(noticesPath, path.join(out, 'THIRD_PARTY_NOTICES.md'));
  if (!existsSync(licensesDirectory))
    throw new Error(`missing license directory: ${licensesDirectory}`);
  for (const name of readdirSync(licensesDirectory).sort()) {
    const source = path.join(licensesDirectory, name);
    if (statSync(source).isFile()) copyFileSync(source, path.join(licenseOut, name));
  }

  const audit = {
    schemaVersion: 1,
    files,
    dependencyEdges: edges,
    systemDependencies: [...systemDlls].sort((a, b) => a.localeCompare(b)),
  };
  writeFileSync(path.join(out, 'DEPENDENCY-AUDIT.json'), `${JSON.stringify(audit, null, 2)}\n`);
  const manifest = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sources: provenance,
    stagedFiles: files,
    licenseFiles: [
      'THIRD_PARTY_NOTICES.md',
      ...readdirSync(licenseOut).map((name) => `licenses/${name}`),
    ],
    systemDependencies: audit.systemDependencies,
  };
  writeFileSync(path.join(out, 'PROVENANCE.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  verifyTools(out, system32Path);
  return audit;
}

function runFile(file, args, { cwd, system32Path }) {
  const result = spawnSync(file, args, {
    cwd,
    env: { ...process.env, PATH: system32Path },
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    error: result.error?.message,
  };
}

export function verifyStagedTools(outputDir, system32Path, run = runFile) {
  const bin = path.resolve(outputDir);
  const cases = [
    ['whisper-cli.exe', ['--version'], 0, /whisper\.cpp version: 1\.9\.5-dev/i],
    ['whisper-server.exe', ['--help'], 0, /usage:/i],
    ['whisper-vad-speech-segments.exe', ['--help'], 0, /usage:/i],
    ['scrb-sherpa.exe', [], 2, /usage: scrb-sherpa/i],
    ['ffmpeg.exe', ['-version'], 0, /ffmpeg version 9\.0/i],
    ['ffprobe.exe', ['-version'], 0, /ffprobe version 9\.0/i],
  ];
  for (const [name, args, expectedStatus, expectedOutput] of cases) {
    const result = run(path.join(bin, name), args, { cwd: bin, system32Path });
    if (result.status !== expectedStatus || !expectedOutput.test(result.output)) {
      throw new Error(
        `${name} failed staged smoke (exit ${result.status}): ${result.error ?? result.output}`,
      );
    }
  }

  const ffmpegConfig = run(path.join(bin, 'ffmpeg.exe'), ['-buildconf'], {
    cwd: bin,
    system32Path,
  });
  const ffmpegLicense = run(path.join(bin, 'ffmpeg.exe'), ['-L'], { cwd: bin, system32Path });
  if (
    ffmpegConfig.status !== 0 ||
    !ffmpegConfig.output.includes('--disable-network') ||
    !ffmpegConfig.output.includes('--enable-static') ||
    /--enable-(gpl|nonfree)/i.test(ffmpegConfig.output) ||
    ffmpegLicense.status !== 0 ||
    !/GNU Lesser General Public\s+License/i.test(ffmpegLicense.output)
  ) {
    throw new Error(
      'ffmpeg build configuration does not match the verified LGPL/no-network profile',
    );
  }
  return { verifiedToolCount: cases.length, path: system32Path };
}

function parseArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if (!name.startsWith('--') || !argv[i + 1]) throw new Error(`invalid argument: ${name}`);
    const key = name.slice(2);
    if (key === 'runtime-dir') (options.runtimeDirs ??= []).push(path.resolve(argv[++i]));
    else options[key] = path.resolve(argv[++i]);
  }
  return options;
}

function requiredPath(options, name) {
  const value = options[name];
  if (!value || !existsSync(value)) throw new Error(`missing --${name} path`);
  return value;
}

function sha256Matches(file, expected, label) {
  const actual = digest(file);
  if (actual !== expected)
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, got ${actual}`);
  return actual;
}

function gitHead(directory) {
  return execFileSync('git', ['-C', directory, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

function dumpbinInspector(dumpbin) {
  return (file) => {
    const output = execFileSync(dumpbin, ['/nologo', '/dependents', file], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseDumpbinDependencies(output);
  };
}

function main() {
  if (process.platform !== 'win32') throw new Error('stage-win-tools.mjs must run on Windows');
  const options = parseArguments(process.argv.slice(2));
  const repo = options.repo ? path.resolve(options.repo) : process.cwd();
  if (!options.out) throw new Error('missing --out path');
  const out = path.resolve(options.out);
  const whisperBin = requiredPath(options, 'whisper-bin');
  const whisperSource = requiredPath(options, 'whisper-source');
  const sherpaBin = requiredPath(options, 'sherpa-bin');
  const sherpaLib = requiredPath(options, 'sherpa-lib');
  const ffmpegBin = requiredPath(options, 'ffmpeg-bin');
  const sherpaArchive = requiredPath(options, 'sherpa-archive');
  const dumpbin = requiredPath(options, 'dumpbin');
  const runtimeDirs = options.runtimeDirs ?? [];
  if (runtimeDirs.length === 0 || runtimeDirs.some((directory) => !existsSync(directory))) {
    throw new Error(
      'provide one or more existing --runtime-dir paths for the MSVC redistributable',
    );
  }
  const whisperCommit = gitHead(whisperSource);
  if (whisperCommit !== WHISPER_COMMIT)
    throw new Error(`unexpected whisper.cpp source commit: ${whisperCommit}`);
  const sherpaArchiveSha = sha256Matches(
    sherpaArchive,
    SHERPA_RELEASE_SHA256,
    'sherpa-onnx release archive',
  );
  for (const [name, expected] of Object.entries(PINNED_INPUT_HASHES)) {
    const source = name.startsWith('ff') ? path.join(ffmpegBin, name) : path.join(sherpaLib, name);
    sha256Matches(source, expected, name);
  }
  const system32Path = path.join(process.env.WINDIR ?? 'C:\\Windows', 'System32');
  const toolSources = Object.fromEntries(
    REQUIRED_TOOLS.map((name) => [
      name,
      path.join(
        name.startsWith('whisper-')
          ? whisperBin
          : name === 'scrb-sherpa.exe'
            ? sherpaBin
            : ffmpegBin,
        name,
      ),
    ]),
  );
  const sherpaSource = path.join(repo, 'packages', 'transcription', 'native', 'scrb-sherpa.cpp');
  const provenance = {
    operatingSystemBuild: os.release(),
    whisper: { version: '1.9.5-dev', commit: whisperCommit, license: 'MIT' },
    sherpaOnnx: {
      version: '2.0.1',
      sourceCommit: SHERPA_COMMIT,
      releaseArchiveSha256: sherpaArchiveSha,
      license: 'Apache-2.0',
    },
    onnxRuntime: { version: '1.28.2', license: 'MIT' },
    scrbSherpa: {
      source: 'packages/transcription/native/scrb-sherpa.cpp',
      sha256: digest(sherpaSource),
    },
    ffmpeg: {
      version: '9.0',
      sha256: {
        ffmpeg: PINNED_INPUT_HASHES['ffmpeg.exe'],
        ffprobe: PINNED_INPUT_HASHES['ffprobe.exe'],
      },
      license: 'LGPL-2.1-or-later',
      opus: { version: '1.6.1', license: 'BSD-3-Clause' },
      profile: 'static; file/pipe protocols; network, GPL and nonfree disabled',
    },
    msvcRedistributable: {
      redistVersion: '14.44.35112',
      dllFileVersion: '14.44.35211.0',
      architecture: 'x64',
      dllSha256: PINNED_MSVC_RUNTIME_HASHES,
      license: 'Microsoft Visual C++ Redistributable',
    },
  };

  const audit = stageWindowsTools({
    outputDir: out,
    toolSources,
    sourceDirectories: [...runtimeDirs, sherpaLib, whisperBin, ffmpegBin, sherpaBin],
    system32Path,
    inspectDependencies: dumpbinInspector(dumpbin),
    pinnedRuntimeHashes: PINNED_MSVC_RUNTIME_HASHES,
    additionalFiles: [path.join(sherpaLib, 'onnxruntime_providers_shared.dll')],
    verifyTools: (directory, system32) => verifyStagedTools(directory, system32),
    provenance,
    noticesPath: path.join(repo, 'packages', 'transcription', 'THIRD_PARTY_NOTICES.md'),
    licensesDirectory: path.join(repo, 'packages', 'transcription', 'licenses', 'windows'),
  });
  process.stdout.write(
    `Staged ${REQUIRED_TOOLS.length} tools and ${audit.files.length - REQUIRED_TOOLS.length} DLLs in ${out}; staged-tool smoke passed with PATH limited to ${system32Path}.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
