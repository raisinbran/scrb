import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModelInfo } from '@scrb/contracts';
import digests from '../../../../scripts/model-digests.json';

/** Folder name of the app's own data; fixed so the app name never decides where data lives. */
export const USER_DATA_FOLDER = path.join('@scrb', 'desktop');
export const MODELS_FOLDER_NAME = 'Scribe';

/** The one place models are installed (scripts/package-mac.sh --install-models writes here). */
export const modelsDirFor = (home: string): string =>
  path.join(home, 'Library', 'Application Support', MODELS_FOLDER_NAME, 'models');
/**
 * The folder Electron used before the rename (the package name `@scrb/desktop` under the
 * platform's application-data folder), so saved library pointers and settings stay found.
 */
export const userDataFor = (appData: string): string => path.join(appData, USER_DATA_FOLDER);

export type DigestTable = Record<string, { sha256: string; bytes: number }>;
const DIGESTS = digests as DigestTable;

const TOOLS = [
  'scrb-capture',
  'whisper-cli',
  'whisper-server',
  'whisper-vad-speech-segments',
  'scrb-sherpa',
  'ffmpeg',
  'ffprobe',
] as const;

interface ModelRow {
  file: string;
  role: ModelInfo['role'];
  label: string;
}
const MODELS: ModelRow[] = [
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
 */
async function verified(
  file: string,
  name: string,
  cacheFile: string,
  table: DigestTable,
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
  const key = `${info.size}:${Math.trunc(info.mtimeMs)}:${want.sha256}`;
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(await readFile(cacheFile, 'utf8')) as Record<string, string>;
  } catch {
    /* no cache yet */
  }
  if (cache[name] === key) return true;
  if ((await sha256(file)) !== want.sha256) return false;
  cache[name] = key;
  await writeFile(cacheFile, JSON.stringify(cache)).catch(() => undefined);
  return true;
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
}): Promise<PackagedSetup> {
  const { resourcesPath, userDataPath, modelsDir } = options;
  const table = options.digests ?? DIGESTS;
  const bin = path.join(resourcesPath, 'bin');
  const configDir = path.join(userDataPath, 'config');
  const missing: string[] = [];
  const tool = (name: (typeof TOOLS)[number]): string => {
    const file = path.join(bin, name);
    if (!existsSync(file)) missing.push(`tool ${name}`);
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

export function missingMessage(missing: string[]): string {
  return `Scribe cannot record yet. Missing: ${missing.join(', ')}. Run scripts/package-mac.sh --install-models from the scrb folder, then reopen Scribe.`;
}
