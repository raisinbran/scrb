/**
 * What the app core and a platform capture adapter say to each other. Backend only: nanosecond
 * times and adapter events never reach the UI. See `docs/plans/capture-contract-and-clock.md`.
 */

export type Track = 'microphone' | 'meeting';

export const TRACKS: readonly Track[] = ['microphone', 'meeting'];

export interface OpenCommand {
  name: 'open';
  sessionId: string;
  outputDir: string;
  /** Process IDs of the meeting app, or `wholeComputer`. */
  source: number[] | 'wholeComputer';
  /** A device ID, or `default`. */
  mic: string;
}

export type CaptureCommand =
  | OpenCommand
  | { name: 'start' | 'pause' | 'resume' | 'stop' }
  | { name: 'selectMic'; mic: string }
  | { name: 'selectSource'; source: number[] | 'wholeComputer' }
  | { name: 'listMics' }
  /** `include` names saved apps that need a row even when they are not running. */
  | { name: 'listApps'; include: string[] };

export interface HelperMic {
  id: string;
  name: string;
  isSystemDefault: boolean;
  transport: 'builtIn' | 'usb' | 'bluetooth' | 'bluetoothHandsFree' | 'other';
}

export interface HelperApp {
  bundleId: string;
  name: string;
  running: boolean;
  /** Every process of the app that has an audio object, helpers included. */
  pids: number[];
}

/**
 * The reply to a command. A retry with the same ID returns the first reply and repeats nothing,
 * so a lost reply can be told from a failed command.
 */
export interface CaptureAck {
  id: string;
  ok: boolean;
  /** The shared gate after this command. Audio passes it only when `open`. */
  gate: 'open' | 'closed';
  /** Session-clock time the command took effect. */
  atNs: number | null;
  /** Tracks audio is passing on. Shorter than both after a partial start or resume. */
  activeTracks: Track[];
  error?: string;
  /** The reply to `listMics`. */
  mics?: HelperMic[];
  /** The reply to `listApps`. */
  apps?: HelperApp[];
}

export type CaptureEvent =
  | {
      type: 'streamDead' | 'streamReopened' | 'permissionLost' | 'permissionRestored';
      track: Track;
    }
  | { type: 'sourceChanged'; alive: boolean }
  | { type: 'health'; micDb: number; meetingDb: number }
  | { type: 'writeError'; message: string };

/** One running audio worker. */
export interface CaptureAdapter {
  /** Resolves with the reply, however late. Never rejects for a refused command. */
  send(id: string, command: CaptureCommand): Promise<CaptureAck>;
  onEvent(listener: (event: CaptureEvent) => void): void;
  /** Runs once when the worker stops, whatever the cause. */
  onExit(listener: () => void): void;
  /** Ends the worker at once, stopping all capture. */
  kill(): void;
}
export { ProcessAdapter } from './process-adapter.ts';
export { readApps, readMics } from './source-lists.ts';
