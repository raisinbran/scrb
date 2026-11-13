import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AppSettings, ModelInfo, PermissionState, SetupStatus } from '@scrb/contracts';

export interface SetupStatusSources {
  readSettings: () => AppSettings;
  /** The capture helper path (SCRB_CAPTURE_HELPER), when configured. */
  helper?: string | undefined;
  /** The final-pass config path (SCRB_FINAL_PASS_CONFIG), when configured. */
  finalPassConfig?: string | undefined;
  /** The live config path (SCRB_LIVE_CONFIG), when configured. */
  liveConfig?: string | undefined;
  /** Electron's getMediaAccessStatus('microphone'); absent where the OS cannot report it. */
  microphoneStatus?: (() => string) | undefined;
}

// The final pass's keys plus ffprobe, which imports refuse to run without.
const FINAL_TOOLS = ['ffmpeg', 'ffprobe', 'whisperCli', 'sherpaSidecar'];
const LIVE_TOOLS = ['whisperServer', 'whisperVad'];

type Paths = Record<string, string | undefined>;

async function readConfig(path: string | undefined): Promise<{ tools: Paths; models: Paths }> {
  const empty = { tools: {}, models: {} };
  if (!path) return empty;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    const section = (value: unknown): Paths =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : {};
    const config = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return { tools: section(config['tools']), models: section(config['models']) };
  } catch {
    return empty;
  }
}

const present = (path: string | undefined): path is string => !!path && existsSync(path);

async function sizeOf(paths: (string | undefined)[]): Promise<number> {
  let total = 0;
  for (const path of paths) {
    try {
      if (path) total += (await stat(path)).size;
    } catch {
      // A missing file counts as zero bytes.
    }
  }
  return total;
}

async function modelInfo(
  role: ModelInfo['role'],
  name: string,
  paths: (string | undefined)[],
): Promise<ModelInfo> {
  const installed = paths.every(present);
  return {
    role,
    name,
    version: 'local',
    installed,
    sizeBytes: installed ? await sizeOf(paths) : 0,
  };
}

export function microphoneState(read: (() => string) | undefined): PermissionState {
  if (!read) return 'unknown';
  try {
    const status = read();
    if (status === 'granted') return 'granted';
    if (status === 'not-determined') return 'notDetermined';
    // Restricted (parental controls, MDM) blocks recording as firmly as a denial.
    if (status === 'denied' || status === 'restricted') return 'denied';
  } catch {
    // Fall through: an unreadable status is reported as unknown, not guessed.
  }
  return 'unknown';
}

/**
 * Real-mode setup status: which configured models and tools exist on disk, and the microphone
 * permission. System audio stays 'unknown' because macOS offers no read without a prompt.
 * `complete` needs every configured final-pass file, the helper, a granted microphone and a
 * saved location; the meeting-audio permission cannot be read, so it does not gate completion.
 */
export function createSetupStatusHandler(sources: SetupStatusSources) {
  return async (): Promise<SetupStatus> => {
    const final = await readConfig(sources.finalPassConfig);
    const live = await readConfig(sources.liveConfig);
    const models: ModelInfo[] = [];
    if (sources.liveConfig)
      models.push(
        await modelInfo('liveSpeech', basename(live.models['speechLive'] ?? 'live speech'), [
          live.models['speechLive'],
        ]),
      );
    if (sources.finalPassConfig) {
      models.push(
        await modelInfo('finalSpeech', basename(final.models['speechFinal'] ?? 'final speech'), [
          final.models['speechFinal'],
        ]),
        await modelInfo('speaker', 'Segmentation and embedding', [
          final.models['segmentation'],
          final.models['embedding'],
        ]),
      );
    }
    const toolPaths = [
      sources.helper,
      ...FINAL_TOOLS.map((key) => final.tools[key]),
      ...(sources.liveConfig ? LIVE_TOOLS.map((key) => live.tools[key]) : []),
      final.models['vad'],
      ...(sources.liveConfig ? [live.models['vad']] : []),
    ];
    const toolsReady = !!sources.finalPassConfig && toolPaths.every(present);
    const permissions = {
      microphone: microphoneState(sources.microphoneStatus),
      meetingAudio: 'unknown' as const,
    };
    const locationSet = sources.readSettings().location.country !== null;
    return {
      models,
      permissions,
      locationSet,
      complete:
        toolsReady &&
        models.every((model) => model.installed) &&
        permissions.microphone === 'granted' &&
        locationSet,
    };
  };
}
