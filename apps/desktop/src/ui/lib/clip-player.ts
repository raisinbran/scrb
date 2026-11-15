import type { Backend, MeetingId } from '@scrb/contracts';
import type { AudioOutput } from './playback-engine.ts';

/** Checks the audio element's own clock this often, as the shared engine does. */
const CHECK_MS = 50;
/** A safety net only, in case no clock check ever runs. */
const FALLBACK_MS = 150;
export const LEAD_IN_MS = 500;
const NO_AUDIO = 'Audio isn’t available for this passage.';

interface Active {
  audio: AudioOutput;
  startMs: number;
  stopped: boolean;
}

/**
 * Plays one short time range of a meeting, stopping on the audio elements' own clock.
 * The backend only hands out audio during a playback session, so a clip opens one with
 * `seekAudio` and ends it with `pauseAudio`. Applies to one meeting at a time.
 */
export class ClipPlayer {
  private active: Active[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private fallback: ReturnType<typeof setTimeout> | undefined;
  private turn = 0;
  private meetingId: MeetingId | null = null;

  constructor(
    private readonly backend: Backend,
    private readonly onEnd: (error: string | null) => void,
    private readonly createAudio: () => AudioOutput = () => new Audio(),
  ) {}

  /** Plays [startMs - lead-in, endMs]. Resolves once playing; the end is reported to `onEnd`. */
  async play(meetingId: MeetingId, startMs: number, endMs: number): Promise<void> {
    this.release();
    const turn = ++this.turn;
    const from = Math.max(0, startMs - LEAD_IN_MS);
    this.meetingId = meetingId;
    try {
      await this.backend.call('seekAudio', { meetingId, positionMs: Math.round(from) });
      if (turn !== this.turn) return;
      const { chunks } = await this.backend.call('getPlaybackMedia', {
        meetingId,
        positionMs: Math.round(from),
      });
      if (turn !== this.turn) return;
      const usable = chunks.filter((chunk) => chunk.endMs > from && chunk.startMs < endMs);
      if (usable.length === 0) throw new Error(NO_AUDIO);
      for (const chunk of usable) {
        const audio = this.createAudio();
        const slot: Active = { audio, startMs: chunk.startMs, stopped: false };
        audio.preload = 'auto';
        audio.addEventListener('timeupdate', () => this.check(turn, endMs));
        audio.addEventListener('ended', () => {
          slot.stopped = true;
          this.check(turn, endMs);
        });
        audio.addEventListener('error', () => {
          slot.stopped = true;
          this.check(turn, endMs);
        });
        audio.src = chunk.url;
        const offset = Math.max(0, from - chunk.startMs) / 1000;
        if (offset > 0) audio.currentTime = offset;
        this.active.push(slot);
        audio.play().catch((failure: unknown) => {
          if ((failure as Error).name !== 'AbortError') {
            slot.stopped = true;
            this.check(turn, endMs);
          }
        });
      }
      this.timer = setInterval(() => this.check(turn, endMs), CHECK_MS);
      this.fallback = setTimeout(() => this.check(turn, endMs), endMs - from + FALLBACK_MS);
    } catch (failure) {
      if (turn !== this.turn) return;
      this.finish(failure instanceof Error ? failure.message : NO_AUDIO);
    }
  }

  /** Stops at once and ends the backend session. Safe to call when nothing plays. */
  stop(): void {
    this.turn += 1;
    this.release();
    this.endSession();
  }

  private check(turn: number, endMs: number): void {
    if (turn !== this.turn || this.active.length === 0) return;
    const over = this.active.every(
      ({ audio, startMs, stopped }) => stopped || audio.currentTime * 1000 + startMs >= endMs,
    );
    if (over) this.finish(null);
  }

  private finish(error: string | null): void {
    this.turn += 1;
    this.release();
    this.endSession();
    this.onEnd(error);
  }

  private release(): void {
    clearInterval(this.timer);
    clearTimeout(this.fallback);
    this.timer = undefined;
    this.fallback = undefined;
    for (const { audio } of this.active) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.active = [];
  }

  private endSession(): void {
    const meetingId = this.meetingId;
    this.meetingId = null;
    if (meetingId) void this.backend.call('pauseAudio', { meetingId }).catch(() => undefined);
  }
}
