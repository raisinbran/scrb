#!/usr/bin/env node
// Verify the staged ARM64 runtime and embed its source/build provenance in the app.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectSourceChanges, summarizeProbe } from './mac-provenance-utils.mjs';

const [appArg, repoArg, assetsArg, captureArg, whisperArg, toolsArg, llamaArg, sherpaLibArg] =
  process.argv.slice(2);
if (!sherpaLibArg) {
  console.error(
    'usage: write-mac-provenance.mjs <app> <repo> <assets> <capture> <whisper-bin> <tools> <llama-bin> <sherpa-lib>',
  );
  process.exit(2);
}

const app = path.resolve(appArg);
const repo = path.resolve(repoArg);
const assets = path.resolve(assetsArg);
const capture = path.resolve(captureArg);
const whisper = path.resolve(whisperArg);
const tools = path.resolve(toolsArg);
const llama = path.resolve(llamaArg);
const sherpaLib = path.resolve(sherpaLibArg);
const bin = path.join(app, 'Contents', 'Resources', 'bin');
const auditPath = path.join(bin, 'DEPENDENCY-AUDIT.json');
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const requiredTools = [
  'scrb-capture',
  'whisper-cli',
  'whisper-server',
  'whisper-vad-speech-segments',
  'scrb-sherpa',
  'ffmpeg',
  'ffprobe',
  'llama-server',
];
const expectedUpstreams = {
  'whisper.cpp': '284029c07012d2000941a08d38a31ffb71f4734e',
  'sherpa-onnx': 'af2d8d81dbfa61c4cea4c568da78f3982edca005',
  'llama.cpp': '369dcf309c8b274370e692ac2d42d9708597ae04',
  opus: '251d657e92fccfa3b05baec4f05756cce252fb75',
};
const requiredLicenses = [
  'FFmpeg-LGPL-2.1.txt',
  'opus-BSD-3-Clause.txt',
  'whisper.cpp-MIT.txt',
  'sherpa-onnx-Apache-2.0.txt',
  'onnxruntime-MIT.txt',
  'llama.cpp-MIT.txt',
  'cpp-httplib-MIT.txt',
  'jsonhpp-MIT.txt',
  'onnxruntime-THIRD-PARTY-NOTICES.txt',
  'pyannote-segmentation-MIT.txt',
];
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
const runProbe = (name, args, expectedStatus = 0, pattern) => {
  const result = spawnSync(path.join(bin, name), args, {
    encoding: 'utf8',
    timeout: 15_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error || result.status !== expectedStatus || (pattern && !pattern.test(output))) {
    throw new Error(
      `${name} probe failed (status=${result.status ?? 'none'}): ${result.error?.message ?? output.slice(0, 800)}`,
    );
  }
  return summarizeProbe({
    args,
    status: result.status,
    output,
    matchedExpectedOutput: !pattern || pattern.test(output),
  });
};

for (const [name, relative] of Object.entries({
  'whisper.cpp': 'upstream/whisper.cpp',
  'sherpa-onnx': 'upstream/sherpa-onnx',
  'llama.cpp': 'upstream/llama.cpp',
  opus: 'upstream/opus',
})) {
  const actual = run('git', ['-C', path.join(assets, relative), 'rev-parse', 'HEAD']);
  if (actual !== expectedUpstreams[name])
    throw new Error(`${name} source revision mismatch: ${actual}`);
}

const stagedNames = new Set(audit.files.map(({ name }) => name));
for (const name of requiredTools)
  if (!stagedNames.has(name)) throw new Error(`dependency audit lacks ${name}`);
const nativeFiles = [];
for (const entry of audit.files) {
  const file = path.join(bin, entry.name);
  if (!statSync(file).isFile()) throw new Error(`missing packaged artifact ${entry.name}`);
  const architectures = run('lipo', ['-archs', file]).split(/\s+/).sort();
  if (architectures.length !== 1 || architectures[0] !== 'arm64')
    throw new Error(
      `${entry.name} is not a single-architecture ARM64 binary: ${architectures.join(',')}`,
    );
  run('codesign', ['--verify', '--strict', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  entry.stagedSha256 = sha256(file); // Record the final hash after signing and packaging.
  entry.architectures = architectures;
  nativeFiles.push({
    name: entry.name,
    sha256: entry.stagedSha256,
    sourceSha256: entry.sourceSha256,
    sourceCommit: entry.sourceCommit,
  });
}

const licensesDir = path.join(bin, 'licenses');
const licenseFiles = readdirSync(licensesDir)
  .filter((name) => statSync(path.join(licensesDir, name)).isFile())
  .sort();
for (const name of requiredLicenses)
  if (!licenseFiles.includes(name)) throw new Error(`missing packaged license: ${name}`);
if (!statSync(path.join(bin, 'THIRD_PARTY_NOTICES.md')).isFile())
  throw new Error('missing packaged THIRD_PARTY_NOTICES.md');
if (!statSync(path.join(bin, 'TRANSCRIPTION_THIRD_PARTY_NOTICES.md')).isFile())
  throw new Error('missing packaged TRANSCRIPTION_THIRD_PARTY_NOTICES.md');

const sourceCommit = run('git', ['-C', repo, 'rev-parse', 'HEAD']);
const sourceChanges = collectSourceChanges(repo);
const sourceFiles = [
  'scripts/package-mac.sh',
  'scripts/stage-mac-tools.mjs',
  'scripts/mac-provenance-utils.mjs',
  'scripts/write-mac-provenance.mjs',
  'native/macos-capture/src/main.swift',
  'native/macos-capture/src/Capture.swift',
  'native/macos-capture/src/Chunks.swift',
  'native/macos-capture/src/Resample.swift',
  'native/macos-capture/src/LiveFeed.swift',
  'native/macos-capture/src/Permission.swift',
  'native/macos-capture/src/Devices.swift',
  'native/macos-capture/src/MicProbe.swift',
  'native/macos-capture/src/VoiceMic.swift',
  'native/macos-capture/src/rt.c',
  'native/macos-capture/src/rt.h',
  'native/macos-capture/src/LiveRing.c',
  'native/macos-capture/src/LiveRing.h',
  'packages/transcription/native/scrb-sherpa.cpp',
  'packages/transcription/scripts/build-ffmpeg.sh',
  'packages/transcription/scripts/build-sherpa-sidecar.sh',
];
const modelLicense = path.join(
  assets,
  'models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/LICENSE',
);
const licenses = [
  path.join(bin, 'THIRD_PARTY_NOTICES.md'),
  path.join(bin, 'TRANSCRIPTION_THIRD_PARTY_NOTICES.md'),
  ...licenseFiles.map((name) => path.join(licensesDir, name)),
].map((file) => ({ file: path.relative(bin, file), sha256: sha256(file) }));
const ffmpegInputs = [
  [
    'FFmpeg 9.0 source',
    path.join(repo, 'packages/transcription/.work/ffmpeg/ffmpeg-9.0.tar.xz'),
    '7f607a00dd0d28a729d5a4811205812eef01cf6ef6155025febb6f36a9062d52',
  ],
  [
    'Opus 1.6.1 source',
    path.join(repo, 'packages/transcription/.work/ffmpeg/opus-1.6.1.tar.gz'),
    '6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1',
  ],
];
const sourceInputHashes = ffmpegInputs.map(([name, file, expected]) => {
  const actual = sha256(file);
  if (actual !== expected) throw new Error(`${name} SHA-256 mismatch: ${actual}`);
  return { name, sha256: actual };
});
sourceInputHashes.push({
  name: 'pyannote segmentation model license',
  sha256: sha256(modelLicense),
});
const sourceHashManifest = sourceFiles.map((file) => ({
  file,
  sha256: sha256(path.join(repo, file)),
}));
sourceHashManifest.push({
  file: path.relative(assets, path.join(assets, 'upstream/opus/COPYING')),
  sha256: sha256(path.join(assets, 'upstream/opus/COPYING')),
});
const sourceArtifacts = [
  ['scrb-capture', capture, 'repository/native/macos-capture/build/scrb-capture'],
  [
    'whisper-cli',
    path.join(whisper, 'whisper-cli'),
    'dev-assets/upstream/whisper.cpp/build/bin/whisper-cli',
  ],
  [
    'whisper-server',
    path.join(whisper, 'whisper-server'),
    'dev-assets/upstream/whisper.cpp/build/bin/whisper-server',
  ],
  [
    'whisper-vad-speech-segments',
    path.join(whisper, 'whisper-vad-speech-segments'),
    'dev-assets/upstream/whisper.cpp/build/bin/whisper-vad-speech-segments',
  ],
  [
    'scrb-sherpa',
    path.join(tools, 'scrb-sherpa'),
    'repository/packages/transcription/.bin/scrb-sherpa',
  ],
  ['ffmpeg', path.join(tools, 'ffmpeg'), 'repository/packages/transcription/.bin/ffmpeg'],
  ['ffprobe', path.join(tools, 'ffprobe'), 'repository/packages/transcription/.bin/ffprobe'],
  [
    'llama-server',
    path.join(llama, 'llama-server'),
    'dev-assets/upstream/llama.cpp/build/bin/llama-server',
  ],
  [
    'sherpa-onnx-c-api',
    path.join(sherpaLib, 'libsherpa-onnx-c-api.dylib'),
    'dev-assets/upstream/sherpa-onnx/build/install/lib/libsherpa-onnx-c-api.dylib',
  ],
  [
    'onnxruntime',
    path.join(sherpaLib, 'libonnxruntime.dylib'),
    'dev-assets/upstream/sherpa-onnx/build/install/lib/libonnxruntime.dylib',
  ],
].map(([name, file, source]) => ({ name, source, sha256: sha256(file) }));

const probes = [
  runProbe('whisper-cli', ['--version'], 0, /whisper\.cpp version:/i),
  runProbe('whisper-server', ['--help'], 0, /usage:/i),
  runProbe('whisper-vad-speech-segments', ['--help'], 0, /usage:/i),
  runProbe('scrb-sherpa', [], 2, /usage: scrb-sherpa/i),
  runProbe('ffmpeg', ['-version'], 0, /ffmpeg version 9\.0/i),
  runProbe('ffprobe', ['-version'], 0, /ffprobe version 9\.0/i),
  runProbe('llama-server', ['--version'], 0, /version: 0\.8\.0-dev.*commit 369dcf3/i),
];
const buildConf = runProbe('ffmpeg', ['-buildconf'], 0, /--disable-network/);
if (/--enable-(gpl|nonfree)/i.test(buildConf.output))
  throw new Error('FFmpeg package enables GPL or nonfree code');
const ffmpegLicense = runProbe('ffmpeg', ['-L'], 0, /GNU Lesser General Public\s+License/i);

const plist = path.join(app, 'Contents', 'Info.plist');
const bundleId = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist]);
const bundleVersion = run('/usr/libexec/PlistBuddy', [
  '-c',
  'Print :CFBundleShortVersionString',
  plist,
]);
if (bundleId !== 'com.raisinbran.scribe') throw new Error(`unexpected bundle ID ${bundleId}`);

audit.files = audit.files.map((entry) => ({
  ...entry,
  stagedSha256: sha256(path.join(bin, entry.name)),
}));
writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
const provenance = {
  schemaVersion: 1,
  builtAtUtc: new Date().toISOString(),
  candidate: {
    bundleId,
    version: bundleVersion,
    architecture: 'arm64',
    signing: 'ad-hoc; outer bundle verification follows this manifest write',
  },
  repository: {
    commit: sourceCommit,
    ...sourceChanges,
    sourceFiles: sourceHashManifest,
  },
  upstreamCommits: expectedUpstreams,
  sourceInputs: sourceInputHashes,
  sourceArtifacts,
  binaries: audit.files,
  licenseFiles: licenses,
  dependencyEdges: audit.dependencyEdges,
  probes: [...probes, buildConf, ffmpegLicense],
};
writeFileSync(path.join(bin, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(
  `Verified ${nativeFiles.length} packaged ARM64 binaries; provenance written to ${path.join(bin, 'PROVENANCE.json')}`,
);
