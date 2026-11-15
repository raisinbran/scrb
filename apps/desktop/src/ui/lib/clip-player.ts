import type { Backend, MeetingId, TrackKind } from '@scrb/contracts';
import { closeClipSession, openClipSession } from './clip-session.ts';
import { readPlaybackLevel } from './playback-level.ts';
import type { AudioOutput } from './playback-engine.ts';

/** Checks the audio element's own clock this often, as the shared engine does. */
const CHECK_MS = 50;
/** A safety net only, in case no clock check ever runs. */
const FALLBACK_MS = 150;
/** Sound is cut this close to the end, so a late check cannot leave a click or a trailing word. */
const CUT_MS = 60;
export const LEAD_IN_MS = 500;
const NO_AUDIO = 'Audio isn’t available for this passage.';

interface Active {
  audio: AudioOutput;
  startMs: number;
  stopped: boolean;
}

/** Ends any playing clip, for playback that is about to start. Safe when nothing plays. */
export function stopClipPlayback(): void {
  ClipPlayer.current?.interrupt();
}

/**
 * Plays one short time range of a meeting, stopping on the audio elements' own clock.
 * The backend only hands out audio during a playback session, so a clip opens one with
 * `seekAudio` and ends it with `pauseAudio`. Applies to one meeting at a time.
 */
export class ClipPlayer {
  /** Only one clip sounds at a time, and other playback ends it (see `stopClipPlayback`). */
  static current: ClipPlayer | null = null;
  private active: Active[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private fallback: ReturnType<typeof setTimeout> | undefined;
  private turn = 0;
  private meetingId: MeetingId | null = null;
  private holdsSession = false;

  constructor(
    private readonly backend: Backend,
    /** `interrupted` is true when other playback took over, so a sequence must not go on. */
    private readonly onEnd: (error: string | null, interrupted?: boolean) => void,
    private readonly createAudio: () => AudioOutput = () => new Audio(),
  ) {}

  /** Plays [startMs - lead-in, endMs]. Resolves once playing; the end is reported to `onEnd`. */
  async play(
    meetingId: MeetingId,
    startMs: number,
    endMs: number,
    track?: TrackKind,
  ): Promise<void> {
    if (ClipPlayer.current !== this) ClipPlayer.current?.interrupt();
    ClipPlayer.current = this;
    this.release();
    const turn = ++this.turn;
    const from = Math.max(0, startMs - LEAD_IN_MS);
    this.meetingId = meetingId;
    if (!this.holdsSession) {
      this.holdsSession = true;
      openClipSession();
    }
    try {
      await this.backend.call('seekAudio', { meetingId, positionMs: Math.round(from) });
      if (turn !== this.turn) return;
      const { chunks } = await this.backend.call('getPlaybackMedia', {
        meetingId,
        positionMs: Math.round(from),
      });
      if (turn !== this.turn) return;
      const usable = chunks.filter(
        (chunk) =>
          chunk.endMs > from &&
          chunk.startMs < endMs &&
          (track === undefined || chunk.track === track),
      );
      if (usable.length === 0) throw new Error(NO_AUDIO);
      for (const chunk of usable) {
        const audio = this.createAudio();
        const slot: Active = { audio, startMs: chunk.startMs, stopped: false };
        audio.preload = 'auto';
        const level = readPlaybackLevel();
        audio.volume = level.volume;
        audio.muted = level.muted;
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

  /** Another playback took over: stop and tell the owner of this player. */
  interrupt(): void {
    if (this.meetingId === null) return;
    this.stop();
    this.onEnd(null, true);
  }

  /** Stops at once and ends the backend session. Safe to call when nothing plays. */
  stop(): void {
    this.turn += 1;
    this.release();
    this.endSession();
  }

  private check(turn: number, endMs: number): void {
    if (turn !== this.turn || this.active.length === 0) return;
    for (const { audio, startMs } of this.active) {
      if (audio.currentTime * 1000 + startMs >= endMs - CUT_MS) audio.volume = 0;
    }
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
    if (ClipPlayer.current === this) ClipPlayer.current = null;
    const meetingId = this.meetingId;
    this.meetingId = null;
    if (!this.holdsSession) return;
    this.holdsSession = false;
    // Held until the backend has answered, so its closing position event is not the shared player's.
    const closed = meetingId
      ? this.backend.call('pauseAudio', { meetingId }).catch(() => undefined)
      : Promise.resolve();
    void closed.finally(closeClipSession);
  }
}
