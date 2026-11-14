import type { Backend, CallResponse, MeetingId, PlaybackPosition } from '@scrb/contracts';

type MediaChunk = CallResponse<'getPlaybackMedia'>['chunks'][number];

/** The parts of an audio element the engine uses, so tests can supply their own. */
export type AudioOutput = Pick<
  HTMLAudioElement,
  | 'addEventListener'
  | 'currentTime'
  | 'load'
  | 'muted'
  | 'pause'
  | 'paused'
  | 'play'
  | 'preload'
  | 'readyState'
  | 'removeAttribute'
  | 'seeking'
  | 'src'
  | 'volume'
>;

interface Slot {
  chunk: MediaChunk;
  audio: AudioOutput;
  started: boolean;
  ended: boolean;
}

const SYNC_MS = 50;
/** URLs are requested this far ahead, so the next chunk is buffered when its turn comes. */
const LOOKAHEAD_MS = 2000;
/** Starting this early absorbs the time a media element takes to produce sound. */
const START_EARLY_MS = 30;
/** Above this an element is moved back to the clock, which also keeps the tracks together. */
const DRIFT_S = 0.12;
/** A position this far ahead of the local clock is the backend skipping a gap. */
const JUMP_MS = 250;
const HAVE_CURRENT_DATA = 2;
const FAILED = 'Some of the audio could not be played.';

/** Plays one meeting's sealed chunks on the backend's clock, one element per chunk and track. */
export class PlaybackEngine {
  private slots: Slot[] = [];
  private anchor: { positionMs: number; at: number } | null = null;
  private next: number | null = null;
  private loading = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Set while a seek is out: older ticks may still arrive and must not move the clock. */
  private seeking = false;
  private latest: PlaybackPosition | null = null;
  private volume = 1;
  private muted = false;
  /** Bumped by every restart, so a slower earlier grant is dropped. */
  private turn = 0;
  private readonly off: () => void;

  constructor(
    private readonly backend: Backend,
    private readonly meetingId: MeetingId,
    private readonly onError: (message: string) => void,
    private readonly createAudio: () => AudioOutput = () => new Audio(),
    private readonly now: () => number = () => performance.now(),
  ) {
    this.off = backend.on('playbackPosition', (position) => {
      if (position.meetingId !== meetingId) return;
      this.latest = position;
      if (!this.seeking) this.follow(position);
    });
  }

  /** The seek's own position event arrives before its reply, so it is the last one seen. */
  async seek(positionMs: number): Promise<void> {
    this.seeking = true;
    try {
      // Live words carry fractional times, which the request check refuses; whole ms are enough.
      await this.backend.call('seekAudio', {
        meetingId: this.meetingId,
        positionMs: Math.max(0, Math.round(positionMs)),
      });
      if (this.latest?.isPlaying) this.restart(this.latest.positionMs);
    } finally {
      this.seeking = false;
    }
    if (this.latest && !this.latest.isPlaying) this.halt();
  }

  /** The app's own level for every element, new ones included; the system volume is untouched. */
  setVolume(volume: number, muted: boolean): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    for (const { audio } of this.slots) this.applyVolume(audio);
  }

  private applyVolume(audio: AudioOutput): void {
    audio.volume = this.volume;
    audio.muted = this.muted;
  }

  dispose(): void {
    this.off();
    this.halt();
  }

  private follow(position: PlaybackPosition): void {
    if (!position.isPlaying) return this.halt();
    const expected = this.clock();
    if (expected === null || position.positionMs - expected > JUMP_MS) {
      this.restart(position.positionMs);
    }
  }

  private clock(): number | null {
    return this.anchor && this.anchor.positionMs + (this.now() - this.anchor.at);
  }

  private restart(positionMs: number): void {
    this.clear();
    this.anchor = { positionMs, at: this.now() };
    this.next = positionMs;
    this.timer ??= setInterval(() => this.sync(), SYNC_MS);
    this.sync();
  }

  private halt(): void {
    this.clear();
    clearInterval(this.timer);
    this.timer = undefined;
    this.anchor = null;
    this.next = null;
  }

  private clear(): void {
    this.turn += 1;
    this.loading = false;
    for (const slot of this.slots) this.release(slot);
    this.slots = [];
  }

  private release({ audio }: Slot): void {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  private sync(): void {
    const positionMs = this.clock();
    if (positionMs === null) return;
    this.slots = this.slots.filter((slot) => {
      const done = slot.ended || positionMs >= slot.chunk.endMs;
      if (done) this.release(slot);
      return !done;
    });
    for (const slot of this.slots) this.place(slot, positionMs);
    if (!this.loading && this.next !== null && this.next - positionMs < LOOKAHEAD_MS) {
      void this.load(this.next);
    }
  }

  private place(slot: Slot, positionMs: number): void {
    const { audio, chunk } = slot;
    if (positionMs < chunk.startMs - START_EARLY_MS) return;
    const offset = Math.max(0, positionMs - chunk.startMs) / 1000;
    if (!slot.started) {
      slot.started = true;
      if (offset > 0) audio.currentTime = offset;
      audio.play().catch((failure: unknown) => {
        // A pause or a new seek interrupts a pending play; that is not a failure.
        if ((failure as Error).name !== 'AbortError') this.fail(slot);
      });
    } else if (
      !audio.paused &&
      !audio.seeking &&
      audio.readyState >= HAVE_CURRENT_DATA &&
      Math.abs(audio.currentTime - offset) > DRIFT_S
    ) {
      audio.currentTime = offset;
    }
  }

  private async load(positionMs: number): Promise<void> {
    const turn = this.turn;
    this.loading = true;
    try {
      const { chunks, nextPositionMs } = await this.backend.call('getPlaybackMedia', {
        meetingId: this.meetingId,
        positionMs: Math.max(0, Math.round(positionMs)),
      });
      if (turn !== this.turn) return;
      this.next = nextPositionMs;
      for (const chunk of chunks) {
        if (!this.slots.some((slot) => slot.chunk.url === chunk.url)) this.add(chunk);
      }
      this.loading = false;
      this.sync();
    } catch (failure) {
      if (turn !== this.turn) return;
      this.next = null;
      this.loading = false;
      this.onError(failure instanceof Error ? failure.message : FAILED);
    }
  }

  private add(chunk: MediaChunk): void {
    const audio = this.createAudio();
    const slot: Slot = { chunk, audio, started: false, ended: false };
    audio.preload = 'auto';
    this.applyVolume(audio);
    audio.addEventListener('ended', () => {
      slot.ended = true;
      this.sync();
    });
    audio.addEventListener('error', () => this.fail(slot));
    audio.src = chunk.url;
    this.slots.push(slot);
  }

  /** One unreadable chunk loses only its own sound: the clock and the other track carry on. */
  private fail(slot: Slot): void {
    if (!this.slots.includes(slot)) return;
    slot.ended = true;
    this.onError(FAILED);
  }
}
