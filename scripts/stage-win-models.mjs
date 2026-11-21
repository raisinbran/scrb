#!/usr/bin/env node
// Build a portable, hash-verified Windows speech-model handover without packaging models in Scribe.exe.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const SEGMENTATION_ARCHIVE_SHA256 =
  '24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488';
export const SPEECH_MODEL_SOURCES = Object.freeze({
  'ggml-large-v3-turbo-q5_0.bin': 'models/whisper/ggml-large-v3-turbo-q5_0.bin',
  'ggml-small.en-q5_1.bin': 'models/whisper/ggml-small.en-q5_1.bin',
  'ggml-silero-v6.2.0.bin': 'models/whisper/ggml-silero-v6.2.0.bin',
  '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx':
    'models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
  'segmentation-model.int8.onnx': null,
});

const ARCHIVE = 'models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2';
const EXTRACTED = 'sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx';
const MARKER = '@@MODEL_DIGESTS_SHA256@@';
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(file)) hash.update(part);
  return hash.digest('hex');
}

function regularFile(file) {
  if (!existsSync(file)) throw new Error(`missing required input: ${file}`);
  const entry = lstatSync(file);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`not a regular file: ${file}`);
  return entry;
}

async function verifyFile(file, expected, name) {
  const entry = regularFile(file);
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected.sha256) ||
      !Number.isSafeInteger(expected.bytes) || expected.bytes < 1) {
    throw new Error(`invalid pinned digest entry for ${name}`);
  }
  if (entry.size !== expected.bytes) throw new Error(`size mismatch for ${name}`);
  if ((await sha256File(file)) !== expected.sha256.toLowerCase()) {
    throw new Error(`SHA-256 mismatch for ${name}`);
  }
}

/** Called by the build PC. The only injectable pins/paths are for invented fixture tests. */
export async function stageWindowsModels({
  assetsDir,
  outputDir,
  manifestPath = path.join(scriptsDir, 'model-digests.json'),
  installerTemplate = path.join(scriptsDir, 'install-models.ps1'),
  archiveSha256 = SEGMENTATION_ARCHIVE_SHA256,
}) {
  if (!assetsDir || !outputDir) throw new Error('assetsDir and outputDir are required');
  const output = path.resolve(outputDir);
  if (existsSync(output)) throw new Error(`handover output already exists; refusing overwrite: ${output}`);
  const manifestBytes = readFileSync(manifestPath);
  const digests = JSON.parse(manifestBytes.toString('utf8'));
  const required = Object.keys(SPEECH_MODEL_SOURCES);
  for (const name of required) {
    if (!Object.hasOwn(digests, name)) throw new Error(`missing pinned digest for ${name}`);
    const entry = digests[name];
    if (!entry || !/^[a-f0-9]{64}$/i.test(entry.sha256) ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`invalid pinned digest entry for ${name}`);
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(archiveSha256)) throw new Error('invalid segmentation archive pin');

  const installer = readFileSync(installerTemplate, 'utf8');
  if (installer.split(MARKER).length !== 2) throw new Error('installer digest marker missing or repeated');
  const archive = path.join(assetsDir, ARCHIVE);
  regularFile(archive);
  if ((await sha256File(archive)) !== archiveSha256.toLowerCase()) {
    throw new Error('SHA-256 mismatch for segmentation archive');
  }
  for (const [name, relative] of Object.entries(SPEECH_MODEL_SOURCES)) {
    if (relative) await verifyFile(path.join(assetsDir, relative), digests[name], name);
  }

  const parent = path.dirname(output);
  mkdirSync(parent, { recursive: true });
  const pending = mkdtempSync(path.join(parent, '.scribe-model-handover-'));
  try {
    const extracted = path.join(pending, '.extracted');
    mkdirSync(extracted);
    try {
      execFileSync('tar', ['-xjf', archive, '-C', extracted], { stdio: 'pipe' });
    } catch (error) {
      throw new Error(`segmentation archive extraction failed: ${error.message}`, { cause: error });
    }
    const source = path.join(extracted, EXTRACTED);
    const extractedParent = path.dirname(source);
    if (!lstatSync(extractedParent).isDirectory() || lstatSync(extractedParent).isSymbolicLink()) {
      throw new Error('invalid segmentation archive directory');
    }
    await verifyFile(source, digests['segmentation-model.int8.onnx'], 'segmentation-model.int8.onnx');

    const models = path.join(pending, 'models');
    mkdirSync(models);
    for (const [name, relative] of Object.entries(SPEECH_MODEL_SOURCES)) {
      copyFileSync(relative ? path.join(assetsDir, relative) : source, path.join(models, name));
      await verifyFile(path.join(models, name), digests[name], name);
    }
    writeFileSync(path.join(pending, 'model-digests.json'), manifestBytes);
    writeFileSync(path.join(pending, 'install-models.ps1'),
      installer.replace(MARKER, sha256Bytes(manifestBytes)));
    rmSync(extracted, { recursive: true, force: true });
    if (readdirSync(models).length !== required.length) throw new Error('incomplete staged model set');
    if (existsSync(output)) throw new Error(`handover output already exists: ${output}`);
    renameSync(pending, output);
    return output;
  } finally {
    if (existsSync(pending)) rmSync(pending, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--assets' || args[2] !== '--output') {
    console.error('Usage: node scripts/stage-win-models.mjs --assets <dev-assets> --output <new-handover-folder>');
    process.exitCode = 2;
  } else {
    stageWindowsModels({ assetsDir: args[1], outputDir: args[3] })
      .then((output) => console.log(`Model handover staged: ${output}`))
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
