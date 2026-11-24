import { afterEach, describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEECH_MODEL_SOURCES, stageWindowsModels } from './stage-win-models.mjs';

const rootScript = path.dirname(fileURLToPath(import.meta.url));
const temp = [];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

afterEach(() => {
  for (const folder of temp.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scribe-model-fixture-'));
  temp.push(root);
  const assetsDir = path.join(root, 'assets');
  const extracted = path.join(root, 'extract', 'sherpa-onnx-pyannote-segmentation-3-0');
  mkdirSync(extracted, { recursive: true });
  const extractedFile = path.join(extracted, 'model.int8.onnx');
  writeFileSync(extractedFile, 'invented segmentation');
  const digests = {};
  for (const [name, relative] of Object.entries(SPEECH_MODEL_SOURCES)) {
    const bytes = relative ? Buffer.from(`invented model ${name}`) : readFileSync(extractedFile);
    digests[name] = { sha256: digest(bytes), bytes: bytes.length };
    if (relative) {
      const file = path.join(assetsDir, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
  }
  digests['Qwen3.5-9B-Q4_K_M.gguf'] = { sha256: digest('summary'), bytes: 7 };
  const manifestPath = path.join(root, 'model-digests.json');
  writeFileSync(manifestPath, JSON.stringify(digests));
  const archive = path.join(
    assetsDir,
    'models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2',
  );
  mkdirSync(path.dirname(archive), { recursive: true });
  const createArchive = () =>
    execFileSync('tar', [
      '-cjf',
      archive,
      '-C',
      path.join(root, 'extract'),
      'sherpa-onnx-pyannote-segmentation-3-0',
    ]);
  createArchive();
  const options = {
    assetsDir,
    outputDir: path.join(root, 'handover'),
    manifestPath,
    installerTemplate: path.join(rootScript, 'install-models.ps1'),
    archiveSha256: digest(readFileSync(archive)),
  };
  return { root, archive, createArchive, extractedFile, digests, manifestPath, options };
}

const empty = (f) => {
  expect(existsSync(f.options.outputDir)).toBe(false);
  expect(readdirSync(f.root).filter((name) => name.startsWith('.scribe-model-handover-'))).toEqual(
    [],
  );
};

describe('portable Windows speech-model handover', () => {
  it('stages precisely five verified speech models, not summary models', async () => {
    const f = fixture();
    await stageWindowsModels(f.options);
    expect(readdirSync(f.options.outputDir).sort()).toEqual([
      'install-models.ps1',
      'model-digests.json',
      'models',
    ]);
    expect(readdirSync(path.join(f.options.outputDir, 'models')).sort()).toEqual(
      Object.keys(SPEECH_MODEL_SOURCES).sort(),
    );
    const bytes = readFileSync(f.manifestPath);
    expect(readFileSync(path.join(f.options.outputDir, 'model-digests.json'))).toEqual(bytes);
    const installer = readFileSync(path.join(f.options.outputDir, 'install-models.ps1'), 'utf8');
    expect(installer).toContain(digest(bytes));
    expect(installer).not.toContain('@@MODEL_DIGESTS_SHA256@@');
  });

  it('rejects missing models without creating output', async () => {
    const f = fixture();
    rmSync(path.join(f.options.assetsDir, SPEECH_MODEL_SOURCES['ggml-small.en-q5_1.bin']));
    await expect(stageWindowsModels(f.options)).rejects.toThrow('missing required input');
    empty(f);
  });

  it('rejects same-length one-byte corruption', async () => {
    const f = fixture();
    const file = path.join(f.options.assetsDir, SPEECH_MODEL_SOURCES['ggml-small.en-q5_1.bin']);
    const bytes = readFileSync(file);
    bytes[0] ^= 1;
    writeFileSync(file, bytes);
    await expect(stageWindowsModels(f.options)).rejects.toThrow('SHA-256 mismatch');
    empty(f);
  });

  it('rejects truncation', async () => {
    const f = fixture();
    writeFileSync(
      path.join(f.options.assetsDir, SPEECH_MODEL_SOURCES['ggml-small.en-q5_1.bin']),
      'short',
    );
    await expect(stageWindowsModels(f.options)).rejects.toThrow('size mismatch');
    empty(f);
  });

  it('rejects a changed archive before extracting', async () => {
    const f = fixture();
    writeFileSync(f.archive, 'corrupt');
    await expect(stageWindowsModels(f.options)).rejects.toThrow('segmentation archive');
    empty(f);
  });

  it('rejects an incomplete archive even when its test-only archive pin matches', async () => {
    const f = fixture();
    rmSync(f.extractedFile);
    writeFileSync(path.join(path.dirname(f.extractedFile), 'README.txt'), 'incomplete');
    f.createArchive();
    f.options.archiveSha256 = digest(readFileSync(f.archive));
    await expect(stageWindowsModels(f.options)).rejects.toThrow('missing required input');
    empty(f);
  });

  it('rejects extracted model mismatch even when its test-only archive pin matches', async () => {
    const f = fixture();
    writeFileSync(f.extractedFile, 'changed segmentation');
    f.createArchive();
    f.options.archiveSha256 = digest(readFileSync(f.archive));
    await expect(stageWindowsModels(f.options)).rejects.toThrow(/mismatch for segmentation-model/);
    empty(f);
  });

  it('rejects absent digest entries', async () => {
    const f = fixture();
    delete f.digests['ggml-small.en-q5_1.bin'];
    writeFileSync(f.manifestPath, JSON.stringify(f.digests));
    await expect(stageWindowsModels(f.options)).rejects.toThrow('missing pinned digest');
    empty(f);
  });

  it('preserves an existing destination', async () => {
    const f = fixture();
    mkdirSync(f.options.outputDir);
    const sentinel = path.join(f.options.outputDir, 'keep.txt');
    writeFileSync(sentinel, 'preserve');
    await expect(stageWindowsModels(f.options)).rejects.toThrow('refusing overwrite');
    expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
  });

  if (process.platform === 'win32') {
    it('PowerShell installs, verifies, reruns idempotently and rejects altered inputs', async () => {
      const f = fixture();
      await stageWindowsModels(f.options);
      const dest = path.join(f.root, 'target', 'Scribe', 'models');
      const script = path.join(f.options.outputDir, 'install-models.ps1');
      const run = (args = []) =>
        spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            script,
            '-Destination',
            dest,
            ...args,
          ],
          { encoding: 'utf8' },
        );
      const verification = run(['-VerifyOnly']);
      expect(verification.status, verification.stderr || verification.stdout).toBe(0);
      expect(existsSync(dest)).toBe(false);
      const first = run();
      expect(first.status, first.stderr).toBe(0);
      const installed = path.join(dest, 'segmentation-model.int8.onnx');
      const original = readFileSync(installed);
      writeFileSync(path.join(dest, 'extra-file.txt'), 'preserve');
      expect(run().status).toBe(0);
      const handoverModel = path.join(
        f.options.outputDir,
        'models',
        'segmentation-model.int8.onnx',
      );
      const altered = Buffer.from(readFileSync(handoverModel));
      altered[0] ^= 1;
      writeFileSync(handoverModel, altered);
      expect(run().status).not.toBe(0);
      expect(readFileSync(installed)).toEqual(original);
      rmSync(handoverModel);
      expect(run().status).not.toBe(0);
      expect(readFileSync(installed)).toEqual(original);
      const manifest = path.join(f.options.outputDir, 'model-digests.json');
      writeFileSync(manifest, '{}');
      expect(run().status).not.toBe(0);
      expect(readFileSync(installed)).toEqual(original);
      expect(readFileSync(path.join(dest, 'extra-file.txt'), 'utf8')).toBe('preserve');
    }, 20_000);

    it('PowerShell refuses partial existing installation without changing it', async () => {
      const f = fixture();
      await stageWindowsModels(f.options);
      const dest = path.join(f.root, 'existing', 'models');
      mkdirSync(dest, { recursive: true });
      writeFileSync(path.join(dest, 'keep.txt'), 'preserve');
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(f.options.outputDir, 'install-models.ps1'),
          '-Destination',
          dest,
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
      expect(readdirSync(dest)).toEqual(['keep.txt']);
    });
  }
});
