import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModelInfo } from '@scrb/contracts';
import { readSummaryPaths, SummaryUnavailableError, type SummaryPaths } from './summary.ts';
import digests from '../../../../scripts/model-digests.json';

/** Folder name of the app's own data; fixed so the app name never decides where data lives. */
export const USER_DATA_FOLDER = path.join('@scrb', 'desktop');
export const MODELS_FOLDER_NAME = 'Scribe';

/**
 * The one place models are installed. macOS: `~/Library/Application Support/Scribe/models`
 * (scripts/package-mac.sh --install-models writes here). Windows: `%LOCALAPPDATA%\\Scribe\\models`,
 * local rather than roaming so the ~810 MB never syncs with a roaming profile.
 */
export function modelsDirFor(
  home: string,
  platform: NodeJS.Platform = process.platform,
  env: { LOCALAPPDATA?: string } = process.env,
): string {
  if (platform === 'win32')
    return path.win32.join(
      env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'),
      MODELS_FOLDER_NAME,
      'models',
    );
  return path.join(home, 'Library', 'Application Support', MODELS_FOLDER_NAME, 'models');
}

/** File name of a bundled tool: Windows tools end in `.exe`. */
export const toolFileName = (name: string, platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? `${name}.exe` : name;
/**
 * The folder Electron used before the rename (the package name `@scrb/desktop` under the
 * platform's application-data folder), so saved library pointers and settings stay found.
 */
export const userDataFor = (appData: string): string => path.join(appData, USER_DATA_FOLDER);

export type DigestTable = Record<string, { sha256: string; bytes: number }>;
export const DIGESTS = digests as DigestTable;

const TOOLS = [
  'scrb-capture',
  'whisper-cli',
  'whisper-server',
  'whisper-vad-speech-segments',
  'scrb-sherpa',
  'ffmpeg',
  'ffprobe',
] as const;

export interface ModelRow {
  file: string;
  role: ModelInfo['role'];
  label: string;
}
export const MODELS: ModelRow[] = [
  { file: 'ggml-large-v3-turbo-q5_0.bin', role: 'finalSpeech', label: 'Final-pass speech model' },
  { file: 'ggml-small.en-q5_1.bin', role: 'liveSpeech', label: 'Live speech model' },
  { file: 'ggml-silero-v6.2.0.bin', role: 'liveSpeech', label: 'Voice activity model' },
  { file: 'segmentation-model.int8.onnx', role: 'speaker', label: 'Speaker segmentation model' },
  {
    file: '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
    role: 'speaker',
    label: 'Speaker embedding model',
  },
];

/** Optional: a missing file never blocks recording, so it is kept out of `MODELS`. */
export const SUMMARY_MODEL: ModelRow = {
  file: 'Qwen3.5-9B-Q4_K_M.gguf',
  role: 'summary',
  label: 'Summary model',
};
const SUMMARY_SERVER = 'llama-server';

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * True when the file has the pinned size and hash. A passing result is remembered by size and
 * modification time, so the 800 MB are hashed once, not at every launch.
 * Configured files use a separate path-and-file-identity cache key, because different directories
 * can contain same-named files with identical size and mtime.
 */
export async function verified(
  file: string,
  name: string,
  cacheFile: string,
  table: DigestTable,
  scope: 'packaged' | 'configured' = 'packaged',
): Promise<boolean> {
  const want = table[name];
  if (!want) return false;
  let info;
  try {
    info = await stat(file);
  } catch {
    return false;
  }
  if (info.size !== want.bytes) return false;
  const identity =
    scope === 'configured'
      ? createHash('sha256')
          .update(path.resolve(file))
          .update(`:${info.dev}:${info.ino}`)
          .digest('hex')
      : null;
  const cacheName = identity ? `configured:${name}:${identity}` : name;
  const stamp =
    scope === 'configured'
      ? `${info.mtimeMs}:${info.ctimeMs}`
      : `${Math.trunc(info.mtimeMs)}`;
  const key = `${info.size}:${stamp}:${want.sha256}`;
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(await readFile(cacheFile, 'utf8')) as Record<string, string>;
  } catch {
    /* no cache yet */
  }
  if (cache[cacheName] === key) return true;
  if ((await sha256(file)) !== want.sha256) return false;
  cache[cacheName] = key;
  await writeFile(cacheFile, JSON.stringify(cache)).catch(() => undefined);
  return true;
}

/**
 * The five required model files as the setup screen lists them: installed only when the file on
 * disk has the pinned size and hash, and `sizeBytes` is the expected size either way.
 */
export async function listModelRows(
  modelsDir: string,
  cacheFile: string,
  table: DigestTable = DIGESTS,
): Promise<ModelInfo[]> {
  const rows: ModelInfo[] = [];
  for (const row of MODELS)
    rows.push({
      role: row.role,
      name: row.label,
      version: row.file,
      installed: await verified(path.join(modelsDir, row.file), row.file, cacheFile, table),
      sizeBytes: table[row.file]?.bytes ?? 0,
    });
  return rows;
}

/** The optional summary model as the setup screen lists it; not part of the five required rows. */
export async function listSummaryRow(
  modelsDir: string,
  cacheFile: string,
  table: DigestTable = DIGESTS,
): Promise<ModelInfo> {
  const { file, role, label } = SUMMARY_MODEL;
  return {
    role,
    name: label,
    version: file,
    installed: await verified(path.join(modelsDir, file), file, cacheFile, table),
    sizeBytes: table[file]?.bytes ?? 0,
  };
}

/**
 * The summary model and the bundled `llama-server`, checked at each call so a model that finishes
 * downloading is found without a restart. Writes nothing. Throws when either is missing.
 */
export async function resolveSummaryPaths(options: {
  resourcesPath: string;
  modelsDir: string;
  cacheFile: string;
  digests?: DigestTable;
  platform?: NodeJS.Platform;
}): Promise<SummaryPaths> {
  const table = options.digests ?? DIGESTS;
  const serverPath = path.join(
    options.resourcesPath,
    'bin',
    toolFileName(SUMMARY_SERVER, options.platform ?? process.platform),
  );
  const modelPath = path.join(options.modelsDir, SUMMARY_MODEL.file);
  const missing = [
    ...(existsSync(serverPath) ? [] : ['the llama.cpp server']),
    ...((await verified(modelPath, SUMMARY_MODEL.file, options.cacheFile, table))
      ? []
      : ['the summary model']),
  ];
  if (missing.length > 0)
    throw new SummaryUnavailableError(
      `Summaries need the summary model and llama.cpp. Missing: ${missing.join(' and ')}. Open Settings > Models to download the summary model. Your audio and transcript are safe.`,
    );
  return { serverPath, modelPath };
}

/**
 * Chosen by the packaged state, never by whether SCRB_FINAL_PASS_CONFIG is set: a packaged process
 * with that variable set must still find the summary files.
 */
export function summaryPathsReader(options: {
  packaged: boolean;
  finalPassConfig: string | undefined;
  resourcesPath: string;
  modelsDir: string;
  cacheFile: string;
  digests?: DigestTable;
  platform?: NodeJS.Platform;
}): () => Promise<SummaryPaths> {
  return () =>
    options.packaged ? resolveSummaryPaths(options) : readSummaryPaths(options.finalPassConfig);
}

export interface PackagedSetup {
  /** Present only when every tool and model is in place. */
  helper: string | null;
  finalPassConfig: string | null;
  liveConfig: string | null;
  missing: string[];
  models: ModelInfo[];
}

/**
 * Packaged builds take every path from the bundle and the models folder, never from the
 * environment. Writes `final-pass.json` and `live.json` under `<userData>/config/` and returns
 * what is missing instead of falling back to the mock.
 */
export async function resolvePackagedSetup(options: {
  resourcesPath: string;
  userDataPath: string;
  modelsDir: string;
  /** Tests only: the pinned table is the default. */
  digests?: DigestTable;
  /** Tests only: the running platform is the default. */
  platform?: NodeJS.Platform;
}): Promise<PackagedSetup> {
  const { resourcesPath, userDataPath, modelsDir } = options;
  const table = options.digests ?? DIGESTS;
  const platform = options.platform ?? process.platform;
  const bin = path.join(resourcesPath, 'bin');
  const configDir = path.join(userDataPath, 'config');
  const missing: string[] = [];
  const tool = (name: (typeof TOOLS)[number]): string => {
    const file = path.join(bin, toolFileName(name, platform));
    if (!existsSync(file)) missing.push(`tool ${toolFileName(name, platform)}`);
    return file;
  };
  const tools = Object.fromEntries(TOOLS.map((name) => [name, tool(name)])) as Record<
    (typeof TOOLS)[number],
    string
  >;
  await mkdir(configDir, { recursive: true });
  const cacheFile = path.join(configDir, 'model-verified.json');
  const models: ModelInfo[] = [];
  const paths: Record<string, string> = {};
  for (const row of MODELS) {
    const file = path.join(modelsDir, row.file);
    const ok = await verified(file, row.file, cacheFile, table);
    if (!ok) missing.push(`model ${row.file}`);
    paths[row.file] = file;
    models.push({
      role: row.role,
      name: row.label,
      version: row.file,
      installed: ok,
      sizeBytes: table[row.file]?.bytes ?? 0,
    });
  }
  if (missing.length > 0)
    return { helper: null, finalPassConfig: null, liveConfig: null, missing, models };

  const finalPassConfig = path.join(configDir, 'final-pass.json');
  const liveConfig = path.join(configDir, 'live.json');
  const large = paths['ggml-large-v3-turbo-q5_0.bin'];
  const vad = paths['ggml-silero-v6.2.0.bin'];
  await writeFile(
    finalPassConfig,
    JSON.stringify({
      tools: {
        ffmpeg: tools.ffmpeg,
        ffprobe: tools.ffprobe,
        whisperCli: tools['whisper-cli'],
        sherpaSidecar: tools['scrb-sherpa'],
      },
      models: {
        speechFinal: large,
        speechLive: large,
        vad,
        segmentation: paths['segmentation-model.int8.onnx'],
        embedding: paths['3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'],
      },
    }),
  );
  await writeFile(
    liveConfig,
    JSON.stringify({
      tools: {
        whisperServer: tools['whisper-server'],
        whisperVad: tools['whisper-vad-speech-segments'],
      },
      models: { speechLive: paths['ggml-small.en-q5_1.bin'], vad },
    }),
  );
  return { helper: tools['scrb-capture'], finalPassConfig, liveConfig, missing, models };
}

/** Creates the folder first: `app.setPath` throws for one that does not exist yet. Never moves or deletes. */
export function pinUserData(
  app: { getPath(name: 'appData'): string; setPath(name: 'userData', value: string): void },
  mkdirFn: (dir: string, options: { recursive: true }) => unknown = mkdirSync,
): string {
  const dir = userDataFor(app.getPath('appData'));
  mkdirFn(dir, { recursive: true });
  app.setPath('userData', dir);
  return dir;
}

export function missingMessage(
  missing: string[],
  platform: NodeJS.Platform = process.platform,
): string {
  // Only models missing: the app downloads them itself, so no terminal step or folder is named.
  if (missing.length > 0 && missing.every((item) => item.startsWith('model ')))
    return 'Scribe needs to download its speech models before it can record. Open Settings, find Models, and press Download models.';
  if (platform === 'win32')
    return `Scribe cannot record yet. Missing: ${missing.join(', ')}. The Windows tools and models are not installed (see docs/plans/packaged-windows-app.md); models belong in %LOCALAPPDATA%\\Scribe\\models. Reopen Scribe after installing them.`;
  return `Scribe cannot record yet. Missing: ${missing.join(', ')}. Run scripts/package-mac.sh --install-models from the scrb folder, then reopen Scribe.`;
}
