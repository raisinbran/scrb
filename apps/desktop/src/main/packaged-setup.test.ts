// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  missingMessage,
  modelsDirFor,
  toolFileName,
  listModelRows,
  listSummaryRow,
  resolvePackagedSetup,
  resolveSummaryPaths,
  summaryPathsReader,
  pinUserData,
  userDataFor,
  type DigestTable,
} from './packaged-setup.ts';
import { SummaryUnavailableError } from './summary.ts';
import realDigests from '../../../../scripts/model-digests.json';

const SUMMARY_FILE = 'Qwen3.5-9B-Q4_K_M.gguf';
const NAMES = Object.keys(realDigests).filter((name) => name !== SUMMARY_FILE);
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
      platform: 'darwin',
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
    const appData = join('h', 'Library', 'Application Support');
    expect(userDataFor(appData)).toBe(join(appData, '@scrb', 'desktop'));
    expect(modelsDirFor('h', 'darwin')).toBe(join(appData, 'Scribe', 'models'));
  });

  it('uses .exe tool names and a local models folder on Windows', async () => {
    expect(toolFileName('ffmpeg', 'win32')).toBe('ffmpeg.exe');
    expect(toolFileName('ffmpeg', 'darwin')).toBe('ffmpeg');
    expect(
      modelsDirFor('C:\\Users\\o', 'win32', { LOCALAPPDATA: 'C:\\Users\\o\\AppData\\Local' }),
    ).toBe('C:\\Users\\o\\AppData\\Local\\Scribe\\models');
    expect(modelsDirFor('C:\\Users\\o', 'win32', {})).toBe(
      'C:\\Users\\o\\AppData\\Local\\Scribe\\models',
    );
    const bin = join(resources, 'bin');
    for (const tool of TOOLS) rmSync(join(bin, tool));
    for (const tool of TOOLS.filter((t) => t !== 'ffprobe'))
      writeFileSync(join(bin, `${tool}.exe`), 'x');
    const setup = await resolvePackagedSetup({
      resourcesPath: resources,
      userDataPath: userData,
      modelsDir: models,
      digests: table,
      platform: 'win32',
    });
    expect(setup.missing).toEqual(['tool ffprobe.exe']);
    expect(missingMessage(setup.missing, 'win32')).toContain('%LOCALAPPDATA%');
    expect(missingMessage(setup.missing, 'darwin')).toContain('package-mac.sh');
  });

  it('tells a user with only models missing to download them in the app, with no terminal step', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      const message = missingMessage(
        ['model ggml-small.en-q5_1.bin', 'model ggml-silero-v6.2.0.bin'],
        platform,
      );
      expect(message).toContain('Download models');
      expect(message).not.toMatch(/package-mac|scripts|LOCALAPPDATA|terminal/i);
    }
    expect(missingMessage(['model a.bin', 'tool ffmpeg'], 'darwin')).toContain('package-mac.sh');
  });

  it("stages each platform's tools only into its own build (no top-level extraResources)", () => {
    const yml = readFileSync(join(__dirname, '../../electron-builder.yml'), 'utf8');
    expect(yml).not.toMatch(/^extraResources:/m);
    const section = (name: string) => yml.split(new RegExp(`^${name}:`, 'm'))[1]!.split(/^\S/m)[0]!;
    expect(section('mac')).toContain('from: build/mac-stage/bin');
    expect(section('mac')).not.toContain('win-stage');
    expect(section('win')).toContain('from: build/win-stage/bin');
    expect(section('win')).not.toContain('mac-stage');
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
      if (name === SUMMARY_FILE) continue; // optional download, not installed by the script
      expect(script).toContain(sha256);
    }
  });
});

describe('listModelRows', () => {
  let dir: string;
  let table: DigestTable;
  const write = (index: number) =>
    writeFileSync(join(dir, NAMES[index] as string), `invented model ${index}`);
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scrb-rows-'));
    table = {};
    NAMES.forEach((name, index) => {
      const bytes = Buffer.from(`invented model ${index}`);
      table[name] = {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      };
    });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const rows = () => listModelRows(dir, join(dir, 'verified.json'), table);

  it('lists all five files as not installed, with their expected sizes, when the folder is empty', async () => {
    const list = await rows();
    expect(list).toHaveLength(5);
    expect(list.map((row) => row.version).sort()).toEqual([...NAMES].sort());
    expect(list.every((row) => !row.installed)).toBe(true);
    for (const row of list) expect(row.sizeBytes).toBe(table[row.version]?.bytes);
  });

  it('marks only the verified files installed in a partial folder', async () => {
    write(0);
    write(1);
    const list = await rows();
    expect(
      list
        .filter((row) => row.installed)
        .map((row) => row.version)
        .sort(),
    ).toEqual([NAMES[0], NAMES[1]].sort());
  });

  it('does not count a file with the wrong content or a part file', async () => {
    writeFileSync(join(dir, NAMES[0] as string), 'invented model X');
    writeFileSync(join(dir, `${NAMES[1]}.part`), `invented model 1`);
    expect((await rows()).filter((row) => row.installed)).toHaveLength(0);
  });

  it('marks all five installed when every file verifies', async () => {
    NAMES.forEach((_, index) => write(index));
    const list = await rows();
    expect(list.every((row) => row.installed)).toBe(true);
  });

  it('uses the pinned digests by default', async () => {
    const list = await listModelRows(dir, join(dir, 'verified.json'));
    expect(list.reduce((sum, row) => sum + row.sizeBytes, 0)).toBe(
      NAMES.reduce((sum, name) => sum + (realDigests as DigestTable)[name]!.bytes, 0),
    );
  });
});

describe('summary model and server (optional)', () => {
  let dir: string;
  let resources: string;
  let models: string;
  let table: DigestTable;
  const model = Buffer.from('invented summary model');
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scrb-sum-'));
    resources = join(dir, 'Resources');
    models = join(dir, 'models');
    mkdirSync(join(resources, 'bin'), { recursive: true });
    mkdirSync(models, { recursive: true });
    table = {
      [SUMMARY_FILE]: {
        sha256: createHash('sha256').update(model).digest('hex'),
        bytes: model.length,
      },
    };
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const resolve = (platform: NodeJS.Platform = 'darwin') =>
    resolveSummaryPaths({
      resourcesPath: resources,
      modelsDir: models,
      cacheFile: join(dir, 'verified.json'),
      digests: table,
      platform,
    });
  const putModel = () => writeFileSync(join(models, SUMMARY_FILE), model);
  const putServer = (name = 'llama-server') => writeFileSync(join(resources, 'bin', name), 'x');

  it('pins the real summary model: 5,680,522,464 bytes and the dev-assets digest', () => {
    expect(realDigests[SUMMARY_FILE as keyof typeof realDigests]).toEqual({
      sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
      bytes: 5680522464,
    });
  });

  it('returns both paths when the server exists and the model verifies', async () => {
    putModel();
    putServer();
    expect(await resolve()).toEqual({
      serverPath: join(resources, 'bin', 'llama-server'),
      modelPath: join(models, SUMMARY_FILE),
    });
  });

  it('uses the .exe name on Windows', async () => {
    putModel();
    putServer('llama-server.exe');
    expect((await resolve('win32')).serverPath).toBe(join(resources, 'bin', 'llama-server.exe'));
  });

  it('writes no config file', async () => {
    putModel();
    putServer();
    await resolve();
    expect(existsSync(join(dir, 'config'))).toBe(false);
  });

  it.each([
    ['model missing', false, true, ['the summary model']],
    ['server missing', true, false, ['the llama.cpp server']],
    ['both missing', false, false, ['the llama.cpp server', 'the summary model']],
  ])(
    'refuses with a message naming Settings > Models when %s',
    async (_n, withModel, withServer) => {
      if (withModel) putModel();
      if (withServer) putServer();
      await expect(resolve()).rejects.toThrow(/Settings > Models/);
      await expect(resolve()).rejects.toBeInstanceOf(SummaryUnavailableError);
    },
  );

  it('rejects a model with the wrong size or digest', async () => {
    putServer();
    writeFileSync(join(models, SUMMARY_FILE), 'invented summary modeX');
    await expect(resolve()).rejects.toThrow(/summary model/);
    writeFileSync(join(models, SUMMARY_FILE), 'short');
    await expect(resolve()).rejects.toThrow(/summary model/);
  });

  it('finds a file that appears after the first call, with no restart', async () => {
    putServer();
    await expect(resolve()).rejects.toThrow();
    putModel();
    await expect(resolve()).resolves.toMatchObject({ modelPath: join(models, SUMMARY_FILE) });
  });

  it('lists the summary row as not installed with its expected size, then installed', async () => {
    const row = () => listSummaryRow(models, join(dir, 'verified.json'), table);
    expect(await row()).toEqual({
      role: 'summary',
      name: 'Summary model',
      version: SUMMARY_FILE,
      installed: false,
      sizeBytes: model.length,
    });
    putModel();
    expect((await row()).installed).toBe(true);
  });

  it('does not block recording when only the summary files are missing', async () => {
    const full: DigestTable = { ...table };
    for (const tool of TOOLS) writeFileSync(join(resources, 'bin', tool), '#!/bin/sh\n');
    NAMES.forEach((name, index) => {
      const bytes = Buffer.from(`invented model ${index}`);
      writeFileSync(join(models, name), bytes);
      full[name] = {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      };
    });
    const setup = await resolvePackagedSetup({
      resourcesPath: resources,
      userDataPath: join(dir, 'userData'),
      modelsDir: models,
      digests: full,
      platform: 'darwin',
    });
    expect(setup.missing).toEqual([]);
    expect(setup.helper).not.toBeNull();
    expect(setup.models.map((m) => m.role)).not.toContain('summary');
  });
});

describe('summaryPathsReader', () => {
  let dir: string;
  const model = Buffer.from('invented summary model');
  const table: DigestTable = {
    [SUMMARY_FILE]: {
      sha256: createHash('sha256').update(model).digest('hex'),
      bytes: model.length,
    },
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scrb-rdr-'));
    mkdirSync(join(dir, 'Resources', 'bin'), { recursive: true });
    mkdirSync(join(dir, 'models'), { recursive: true });
    writeFileSync(join(dir, 'Resources', 'bin', 'llama-server'), 'x');
    writeFileSync(join(dir, 'models', SUMMARY_FILE), model);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const reader = (packaged: boolean, finalPassConfig: string | undefined) =>
    summaryPathsReader({
      packaged,
      finalPassConfig,
      resourcesPath: join(dir, 'Resources'),
      modelsDir: join(dir, 'models'),
      cacheFile: join(dir, 'verified.json'),
      digests: table,
      platform: 'darwin',
    });

  it('packaged, SCRB_FINAL_PASS_CONFIG not set: finds the bundled server and the model', async () => {
    delete process.env['SCRB_FINAL_PASS_CONFIG'];
    const paths = await reader(true, undefined)();
    expect(paths.modelPath).toBe(join(dir, 'models', SUMMARY_FILE));
  });

  it('packaged, SCRB_FINAL_PASS_CONFIG set to a stale file: still uses the packaged paths', async () => {
    process.env['SCRB_FINAL_PASS_CONFIG'] = join(dir, 'does-not-exist.json');
    try {
      const paths = await reader(true, process.env['SCRB_FINAL_PASS_CONFIG'])();
      expect(paths.serverPath).toBe(join(dir, 'Resources', 'bin', 'llama-server'));
    } finally {
      delete process.env['SCRB_FINAL_PASS_CONFIG'];
    }
  });

  it('unpackaged: reads the developer config file, unchanged', async () => {
    await expect(reader(false, undefined)()).rejects.toThrow(/No setup file/);
    const config = join(dir, 'dev.json');
    writeFileSync(
      config,
      JSON.stringify({
        tools: { llamaServer: join(dir, 'Resources', 'bin', 'llama-server') },
        models: { summary: join(dir, 'models', SUMMARY_FILE) },
      }),
    );
    expect((await reader(false, config)()).modelPath).toBe(join(dir, 'models', SUMMARY_FILE));
  });
});
