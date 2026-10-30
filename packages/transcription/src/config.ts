import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ToolPaths {
  ffmpeg: string;
  ffprobe: string;
  whisperCli: string;
  whisperServer: string;
  whisperVad: string;
  sherpaSidecar: string;
}

export interface ModelPaths {
  /** large-v3-turbo-q5_0, the final-pass model. */
  speechFinal: string;
  /** Turbo on GPU machines; small.en-q5_1 with audioContext 768 on CPU only. */
  speechLive: string;
  /** Silero VAD in ggml form. */
  vad: string;
  /** pyannote segmentation 3.0 int8. */
  segmentation: string;
  /** eres2net; the voice-match line was measured on this embedding only. */
  embedding: string;
}

const exe = (name: string): string => (process.platform === 'win32' ? `${name}.exe` : name);

/** Every tool sits in one directory unless a path is given for it. */
export function toolsIn(dir: string, overrides: Partial<ToolPaths> = {}): ToolPaths {
  return {
    ffmpeg: join(dir, exe('ffmpeg')),
    ffprobe: join(dir, exe('ffprobe')),
    whisperCli: join(dir, exe('whisper-cli')),
    whisperServer: join(dir, exe('whisper-server')),
    whisperVad: join(dir, exe('whisper-vad-speech-segments')),
    sherpaSidecar: join(dir, exe('scrb-sherpa')),
    ...overrides,
  };
}

export function missingPaths(paths: ToolPaths | ModelPaths): string[] {
  return Object.values(paths).filter((p) => !existsSync(p));
}
