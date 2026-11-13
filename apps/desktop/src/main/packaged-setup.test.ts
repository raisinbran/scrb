// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  modelsDirFor,
  resolvePackagedSetup,
  pinUserData,
  userDataFor,
  type DigestTable,
} from './packaged-setup.ts';
import realDigests from '../../../../scripts/model-digests.json';

const NAMES = Object.keys(realDigests);
const TOOLS = [
  'scrb-capture',
  'whisper-cli',
  'whisper-server',
  'whisper-vad-speech-segments',
  'scrb-sherpa',
  'ffmpeg',
  'ffprobe',
];

describe('resolvePackagedSetup', () => {
  let dir: string;
  let resources: string;
  let models: string;
  let userData: string;
  let table: DigestTable;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scrb-pkg-'));
    resources = join(dir, 'Resources');
    models = join(dir, 'models');
    userData = join(dir, 'userData');
    mkdirSync(join(resources, 'bin'), { recursive: true });
    mkdirSync(models, { recursive: true });
    table = {};
    for (const tool of TOOLS) writeFileSync(join(resources, 'bin', tool), '#!/bin/sh\n');
    NAMES.forEach((name, index) => {
      const bytes = Buffer.from(`invented model ${index}`);
      writeFileSync(join(models, name), bytes);
      table[name] = {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      };
    });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const resolve = () =>
    resolvePackagedSetup({
      resourcesPath: resources,
      userDataPath: userData,
      modelsDir: models,
      digests: table,
    });

  it('writes both configs with absolute bundle and model paths when all is in place', async () => {
    const setup = await resolve();
    expect(setup.missing).toEqual([]);
    expect(setup.helper).toBe(join(resources, 'bin', 'scrb-capture'));
    const final = JSON.parse(readFileSync(setup.finalPassConfig!, 'utf8'));
    expect(final.tools.whisperCli).toBe(join(resources, 'bin', 'whisper-cli'));
    expect(final.models.segmentation).toBe(join(models, 'segmentation-model.int8.onnx'));
    const live = JSON.parse(readFileSync(setup.liveConfig!, 'utf8'));
    expect(live.models.speechLive).toBe(join(models, 'ggml-small.en-q5_1.bin'));
    expect(setup.models.every((m) => m.installed)).toBe(true);
  });

  it('lists a missing tool and offers no helper, so the app cannot use the mock silently', async () => {
    rmSync(join(resources, 'bin', 'ffmpeg'));
    const setup = await resolve();
    expect(setup.missing).toEqual(['tool ffmpeg']);
    expect(setup.helper).toBeNull();
    expect(setup.finalPassConfig).toBeNull();
  });

  it('rejects a missing, resized or one-byte-changed model', async () => {
    rmSync(join(models, 'ggml-silero-v6.2.0.bin'));
    writeFileSync(join(models, 'ggml-small.en-q5_1.bin'), 'invented model 1'.replace('1', '2'));
    writeFileSync(join(models, 'segmentation-model.int8.onnx'), 'x');
    const setup = await resolve();
    expect(setup.missing).toEqual([
      'model ggml-small.en-q5_1.bin',
      'model ggml-silero-v6.2.0.bin',
      'model segmentation-model.int8.onnx',
    ]);
    expect(setup.models.filter((m) => !m.installed)).toHaveLength(3);
  });

  it('keeps the pinned data folder and the models folder apart from the app name', () => {
    expect(userDataFor('/h/Library/Application Support')).toBe(
      '/h/Library/Application Support/@scrb/desktop',
    );
    expect(modelsDirFor('/h')).toBe('/h/Library/Application Support/Scribe/models');
  });

  it('creates a fresh macOS-style profile folder before pinning, and keeps an existing Windows-style one', () => {
    const calls: string[] = [];
    const fake = (appData: string) => ({
      getPath: () => appData,
      setPath: (_: 'userData', value: string) => calls.push(`set ${value}`),
    });
    // Fresh profile: folder absent, so it must be created before setPath.
    const fresh = join(dir, 'Library', 'Application Support');
    const made = pinUserData(fake(fresh), (d) => {
      calls.push(`mkdir ${d}`);
      mkdirSync(d, { recursive: true });
    });
    expect(calls).toEqual([`mkdir ${made}`, `set ${made}`]);
    expect(existsSync(made)).toBe(true);
    // Existing Windows-style profile with a library pointer: found unchanged, nothing removed.
    const roaming = join(dir, 'AppData', 'Roaming');
    const old = join(roaming, '@scrb', 'desktop');
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, 'library-location.json'), '{"root":"D:\\invented"}');
    expect(pinUserData(fake(roaming))).toBe(old);
    expect(readFileSync(join(old, 'library-location.json'), 'utf8')).toContain('invented');
  });

  it('pins the same digests the dev-assets script downloads', () => {
    const script = readFileSync(join(__dirname, '../../../../scripts/dev-assets.sh'), 'utf8');
    for (const [name, { sha256 }] of Object.entries(realDigests)) {
      if (name === 'segmentation-model.int8.onnx') continue; // extracted from a hash-checked archive
      expect(script).toContain(sha256);
    }
  });
});
