import { ECHO_WINDOW_MS, bare, dropRoomEcho } from './finalPass.js';
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
  /** A trailing mic word that matches a meeting word may start a run; wait for the next segment. */
  private carry: Held | null = null;
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
      const covered = this.headMs >= segment.endMs + ECHO_WINDOW_MS;
      if (!force && !covered && now - arrivedAt < this.holdMs) break;
      this.held.shift();
      this.emit(segment, arrivedAt);
    }
    while (this.carry && (force || now - this.carry.arrivedAt >= this.holdMs)) {
      const queued = this.held.shift();
      if (queued) {
        // The next queued segment may complete a run with the carried word; match it first.
        this.emit(queued.segment, queued.arrivedAt);
      } else {
        const { segment } = this.carry;
        this.carry = null;
        this.out(segment);
      }
    }
    const next = this.held[0] ?? this.carry;
    if (next)
      this.timer = this.setTimer(
        () => {
          this.timer = null;
          this.release(false);
        },
        Math.max(0, this.holdMs - (now - next.arrivedAt)),
      );
  }

  private emit(incoming: TimedLiveSegment, arrivedAt: number): void {
    let carried = this.carry?.segment;
    this.carry = null;
    if (carried && incoming.startMs - carried.endMs > ECHO_WINDOW_MS) {
      this.out(carried);
      carried = undefined;
    }
    const segment = carried
      ? {
          ...incoming,
          words: [...carried.words, ...incoming.words],
          text: `${carried.text} ${incoming.text}`,
          startMs: carried.startMs,
        }
      : incoming;
    const meetingWords = [...this.meeting.values()].flatMap((s) => s.words);
    const kept = new Set(dropRoomEcho([...this.context, ...segment.words], meetingWords));
    let words = segment.words.filter((w) => kept.has(w));
    let tail: TimedLiveSegment['words'] = [];
    const last = segment.words.at(-1)!;
    if (
      kept.has(last) &&
      meetingWords.some(
        (m) =>
          bare(m.text) === bare(last.text) && Math.abs(m.startMs - last.startMs) <= ECHO_WINDOW_MS,
      )
    ) {
      tail = [last];
      words = words.slice(0, -1);
    }
    this.context = [
      ...this.context,
      ...segment.words.slice(0, segment.words.length - tail.length),
    ].slice(-CONTEXT_WORDS);
    if (tail.length)
      this.carry = {
        arrivedAt,
        segment: {
          ...segment,
          id: `${segment.id}-tail`,
          words: tail,
          text: tail[0]!.text,
          startMs: tail[0]!.startMs,
          endMs: tail[0]!.endMs,
        },
      };
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
