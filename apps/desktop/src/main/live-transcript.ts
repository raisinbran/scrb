import { randomUUID } from 'node:crypto';
import type { BackendEvents, EventName, TranscriptSegment } from '@scrb/contracts';
import type { Library, Segment, Speaker, Track } from '@scrb/storage';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;

export interface LiveUtterance {
  id: string;
  track: Track;
  speakerId: string;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
}

const MAX_PENDING_SEGMENTS = 32;

/**
 * Main-process sink for a separate, nonblocking live worker. The native PCM feed is NOT
 * connected here: capture must never await this queue or share its durable writer locks.
 */
export class LiveTranscriptSink {
  private readonly pending: LiveUtterance[] = [];
  private draining: Promise<void> | null = null;
  private closed = false;
  private failed = false;

  constructor(
    private readonly library: Pick<Library, 'appendSegments'>,
    private readonly meetingId: string,
    private readonly emit: Emit,
    private readonly limit = MAX_PENDING_SEGMENTS,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Invalid queue capacity');
  }

  /** Synchronous: a full queue drops provisional text, never durable recorded audio. */
  offer(utterance: LiveUtterance): void {
    if (this.closed || this.failed) return;
    if (
      !utterance.id ||
      !utterance.speakerId ||
      !Number.isFinite(utterance.startMs) ||
      !Number.isFinite(utterance.endMs) ||
      utterance.startMs < 0 ||
      utterance.endMs < utterance.startMs ||
      !utterance.text.trim()
    ) return;
    this.pending.push({ ...utterance });
    const dropped = Math.max(0, this.pending.length - this.limit);
    if (dropped) {
      this.pending.splice(0, dropped);
      this.emit('transcriptionLag', { status: 'lagging', lagMs: 0 });
    }
    this.draining ??= this.drain().finally(() => {
      this.draining = null;
      if (this.pending.length && !this.closed && !this.failed) this.kick();
    });
  }

  private kick(): void {
    if (this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = null;
      if (this.pending.length && !this.closed && !this.failed) this.kick();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending.length && !this.failed) {
      const utterance = this.pending.shift()!;
      const word = {
        id: randomUUID(),
        text: utterance.text.trim(),
        startMs: utterance.startMs,
        endMs: utterance.endMs,
      };
      const segment: Segment = {
        id: utterance.id,
        speakerId: utterance.speakerId,
        track: utterance.track,
        pass: 'live',
        words: [word],
      };
      const speaker: Speaker = {
        id: utterance.speakerId,
        label: utterance.speakerLabel,
        name: null,
        profileId: null,
        userNamed: false,
        mergedInto: null,
      };
      try {
        const saved = await this.library.appendSegments(this.meetingId, [segment], [speaker]);
        const published: TranscriptSegment = {
          id: segment.id,
          speakerId: segment.speakerId,
          track: segment.track,
          startMs: word.startMs,
          endMs: word.endMs,
          words: [{ ...word, state: 'provisional', correctionId: null }],
        };
        // A replace without removals supports interleaved microphone/meeting timestamps.
        this.emit('transcriptChanged', {
          meetingId: this.meetingId,
          revision: saved.revision,
          change: { kind: 'replace', segments: [published], removedSegmentIds: [] },
          speakers: [{
            id: speaker.id,
            label: speaker.label,
            kind: speaker.id === 'you' ? 'you' : 'unknown',
            profileId: null,
          }],
        });
        this.emit('transcriptionLag', {
          status: this.pending.length ? 'lagging' : 'ok',
          lagMs: this.pending.length ? Math.max(0, this.pending.at(-1)!.endMs - this.pending[0]!.startMs) : 0,
        });
      } catch {
        this.failed = true;
        this.pending.length = 0;
        this.emit('transcriptionLag', { status: 'failed', lagMs: 0 });
      }
    }
  }

  /** A worker failure must not interrupt capture or the separate final pass. */
  workerFailed(): void {
    if (this.closed) return;
    this.failed = true;
    this.pending.length = 0;
    this.emit('transcriptionLag', { status: 'failed', lagMs: 0 });
  }

  async stop(): Promise<void> {
    this.closed = true;
    await this.draining;
    this.pending.length = 0;
  }
}
