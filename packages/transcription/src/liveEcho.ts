import { dropRoomEcho } from './finalPass.js';
import type { TimedLiveSegment } from './livePcmEngine.js';

/** Longest a mic segment waits for the meeting words that could prove it is echo. */
export const LIVE_ECHO_HOLD_MS = 2000;
/** Meeting words older than this (in audio time) behind the newest meeting word are forgotten. */
const KEEP_MEETING_MS = 30_000;
const CONTEXT_WORDS = 8;

export interface LiveEchoOptions {
  holdMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

interface Held {
  segment: TimedLiveSegment;
  arrivedAt: number;
}

/**
 * Live counterpart of dropRoomEcho.  Meeting segments pass straight through and fill a
 * rolling word window.  A mic segment is held until the meeting track has produced words
 * past its end plus the echo window (so every possible match has arrived), or at most
 * holdMs, then run through dropRoomEcho against that window.  Held segments leave in
 * arrival order.  A meeting segment that arrives after the hold ran out is not retracted:
 * the final pass still removes that echo.
 */
export class LiveEchoFilter {
  private readonly meeting = new Map<string, TimedLiveSegment>();
  private held: Held[] = [];
  /** Recent mic words of earlier segments (kept or dropped), so a run can span a segment boundary. */
  private context: TimedLiveSegment['words'] = [];
  private headMs = -Infinity;
  private timer: unknown = null;
  private readonly holdMs: number;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(
    private readonly out: (segment: TimedLiveSegment) => void,
    o: LiveEchoOptions = {},
  ) {
    this.holdMs = o.holdMs ?? LIVE_ECHO_HOLD_MS;
    this.now = o.now ?? Date.now;
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  push(segment: TimedLiveSegment): void {
    if (segment.track === 'meeting') {
      this.meeting.set(segment.id, segment);
      this.headMs = Math.max(this.headMs, segment.endMs);
      for (const [id, s] of this.meeting)
        if (s.endMs < this.headMs - KEEP_MEETING_MS) this.meeting.delete(id);
      this.out(segment);
    } else {
      this.held.push({ segment, arrivedAt: this.now() });
    }
    this.release(false);
  }

  /** Release everything now (recording stopped or worker closed). */
  flush(): void {
    this.release(true);
  }

  private release(force: boolean): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const now = this.now();
    while (this.held.length) {
      const { segment, arrivedAt } = this.held[0]!;
      const covered = this.headMs >= segment.endMs;
      if (!force && !covered && now - arrivedAt < this.holdMs) break;
      this.held.shift();
      this.emit(segment);
    }
    if (this.held.length)
      this.timer = this.setTimer(
        () => {
          this.timer = null;
          this.release(false);
        },
        Math.max(0, this.holdMs - (now - this.held[0]!.arrivedAt)),
      );
  }

  private emit(segment: TimedLiveSegment): void {
    const meetingWords = [...this.meeting.values()].flatMap((s) => s.words);
    const kept = new Set(dropRoomEcho([...this.context, ...segment.words], meetingWords));
    this.context = [...this.context, ...segment.words].slice(-CONTEXT_WORDS);
    const words = segment.words.filter((w) => kept.has(w));
    if (words.length === segment.words.length) return this.out(segment);
    if (!words.length) return;
    this.out({
      ...segment,
      words,
      text: words.map((w) => w.text).join(' '),
      startMs: words[0]!.startMs,
      endMs: words.at(-1)!.endMs,
    });
  }
}
