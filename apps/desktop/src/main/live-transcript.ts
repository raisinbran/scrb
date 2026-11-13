import { createHash } from 'node:crypto';
import type { BackendEvents, EventName } from '@scrb/contracts';
import { StaleRevisionError, type Library, type Segment, type Speaker } from '@scrb/storage';
import type { LiveAudioEvent, TimedLiveSegment } from '@scrb/transcription';
import { publishEdit } from './meetings.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;
type Store = Pick<Library, 'readTranscript' | 'appendSegments' | 'replaceLiveSegments'> &
  Partial<Pick<Library, 'mergeLiveSpeaker'>>;
type Merge = Extract<LiveAudioEvent, { type: 'speakerMerge' }>['merge'];

/** Bounded PR #8 sink adapted for timed words. No native feed or recording lifetime is owned here. */
export class LiveTranscriptSink {
  private readonly pending: TimedLiveSegment[] = [];
  private readonly merges = new Map<string, Merge>();
  private draining: Promise<void> | null = null;
  private closed = false;
  private failed = false;
  private lastSavedAtMs: number | null = null;
  private lastPublishedAtMs: number | null = null;
  private lastRevision: number | null = null;

  getProgress() {
    return {
      lastSavedAtMs: this.lastSavedAtMs,
      lastPublishedAtMs: this.lastPublishedAtMs,
      lastRevision: this.lastRevision,
      queued: this.pending.length,
      draining: this.draining !== null,
    };
  }

  constructor(
    private readonly library: Store,
    private readonly meetingId: string,
    private readonly emit: Emit,
    private readonly limit = 32,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 64)
      throw new RangeError('Invalid queue capacity');
  }

  handle = (event: LiveAudioEvent): void => {
    if (this.closed || this.failed) return;
    if (event.type === 'segment') this.offer(event.segment);
    else if (event.type === 'speakerMerge') {
      if (!this.merges.has(event.merge.from) && this.merges.size >= 1024) {
        this.lag('lagging', 0);
        return;
      }
      const old = this.merges.get(event.merge.from);
      if (!old || event.merge.order > old.order)
        this.merges.set(event.merge.from, { ...event.merge });
      this.kick();
    } else if (event.type === 'failed') this.workerFailed();
    else if (event.type === 'lag')
      this.lag(event.lagMs || event.queuedFrames ? 'lagging' : 'ok', event.lagMs);
    else this.lag('lagging', 0);
  };

  offer(segment: TimedLiveSegment): void {
    if (this.closed || this.failed) return;
    if (
      !segment.id ||
      segment.id.length > 256 ||
      !['mic', 'meeting'].includes(segment.track) ||
      !Array.isArray(segment.words) ||
      !segment.words.length ||
      segment.words.length > 256
    )
      return;
    if (
      segment.wordSpeakers &&
      (segment.track !== 'meeting' ||
        segment.wordSpeakers.length !== segment.words.length ||
        segment.wordSpeakers.some(
          (s) =>
            !s ||
            typeof s.id !== 'string' ||
            s.id.length > 256 ||
            !(s.id === 'meeting'
              ? s.label === 'Meeting'
              : /-live-[1-9][0-9]{0,8}$/.test(s.id) &&
                /^(Speaker \?|Speaker [1-9][0-9]{0,8})$/.test(s.label)),
        ))
    )
      return;
    let end = 0;
    for (const word of segment.words) {
      if (
        typeof word.text !== 'string' ||
        !word.text.trim() ||
        word.text.length > 256 ||
        ![word.startMs, word.endMs].every(Number.isFinite) ||
        word.startMs < end ||
        word.endMs < word.startMs
      )
        return;
      end = word.endMs;
    }
    const copy = {
      ...segment,
      words: segment.words.map((w) => ({ ...w })),
      ...(segment.wordSpeakers
        ? { wordSpeakers: segment.wordSpeakers.map((s) => ({ ...s })) }
        : {}),
    };
    const queued = this.pending.findIndex((s) => s.id === segment.id);
    if (queued >= 0) this.pending.splice(queued, 1);
    this.pending.push(copy);
    if (this.pending.length > this.limit) {
      this.pending.shift();
      this.lag('lagging', 0);
    }
    this.kick();
  }

  private kick(): void {
    if (this.draining) return;
    this.draining = this.drain()
      .catch(() => this.fail())
      .finally(() => {
        this.draining = null;
        if ((this.pending.length || this.merges.size) && !this.failed) this.kick();
      });
  }

  private async drain(): Promise<void> {
    while ((this.pending.length || this.merges.size) && !this.failed) {
      const input = this.pending.shift() ?? this.merges.values().next().value!;
      if ('from' in input) this.merges.delete(input.from);
      if ('from' in input) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const before = await this.library.readTranscript(this.meetingId);
          try {
            const saved = await this.library.mergeLiveSpeaker?.(
              this.meetingId,
              input,
              before.revision,
            );
            if (saved && saved.revision !== before.revision) {
              this.lastSavedAtMs = Date.now();
              this.lastRevision = saved.revision;
              publishEdit(before, saved, (name, payload) => this.publish(name, payload));
            }
            break;
          } catch (error) {
            if (!(error instanceof StaleRevisionError)) throw error;
            if (attempt === 2) this.lag('lagging', 0);
          }
        }
        continue;
      }
      // Storage can split frozen corrections into new segments. Persist ownership in
      // word IDs so later revisions (including after reconnect) replace those too.
      const prefix = `live-word-${createHash('sha256').update(input.id).digest('hex')}-`;
      const occurrences = new Map<string, number>();
      const segment: Segment = {
        id: input.id,
        track: input.track === 'mic' ? 'microphone' : 'meeting',
        pass: 'live',
        speakerId: input.track === 'mic' ? 'you' : 'meeting',
        words: input.words.map((word) => {
          const key = JSON.stringify([input.id, word.startMs, word.endMs, word.text]);
          const occurrence = occurrences.get(key) ?? 0;
          occurrences.set(key, occurrence + 1);
          return {
            id: `${prefix}${createHash('sha256').update(key).update(String(occurrence)).digest('hex')}`,
            text: word.text,
            startMs: word.startMs,
            endMs: word.endMs,
          };
        }),
      };
      const segments: Segment[] = [];
      const speakers: Speaker[] = [];
      for (const [index, word] of segment.words.entries()) {
        const attribution = input.track === 'meeting' ? input.wordSpeakers?.[index] : undefined;
        const id = attribution?.id ?? segment.speakerId;
        let group = segments.at(-1);
        if (!group || group.speakerId !== id) {
          group = {
            ...segment,
            id: segments.length ? `${input.id}-part-${index}` : input.id,
            speakerId: id,
            words: [],
          };
          segments.push(group);
        }
        group.words.push(word);
        if (!speakers.some((s) => s.id === id))
          speakers.push({
            id,
            label: attribution?.label ?? (input.track === 'mic' ? 'You' : 'Meeting'),
            name: null,
            profileId: null,
            userNamed: false,
            mergedInto: null,
          });
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = await this.library.readTranscript(this.meetingId);
        const owned = before.segments.filter(
          (s) => s.id === segment.id || s.words.some((w) => w.id.startsWith(prefix)),
        );
        if (before.segments.some((s) => s.track === segment.track && s.pass === 'final')) {
          this.lag('lagging', 0);
          break;
        }
        if (owned.some((s) => s.pass !== 'live' || s.track !== segment.track)) {
          this.lag('lagging', 0);
          break;
        }
        const words = owned.flatMap((s) => s.words).sort((a, b) => a.startMs - b.startMs);
        if (
          owned.length &&
          owned.length === segments.length &&
          owned.every((s, i) => s.speakerId === segments[i]!.speakerId) &&
          speakers.every((s) =>
            before.speakers.some(
              (old) =>
                old.id === s.id &&
                (old.label === s.label ||
                  old.userNamed ||
                  old.profileId !== null ||
                  old.mergedInto !== null),
            ),
          ) &&
          words.length === segment.words.length &&
          words.every((w, i) => {
            const next = segment.words[i]!;
            return (
              w.id === next.id &&
              w.text === next.text &&
              w.startMs === next.startMs &&
              w.endMs === next.endMs
            );
          })
        )
          break;
        try {
          const saved = owned.length
            ? await this.library.replaceLiveSegments(
                this.meetingId,
                owned.map((s) => s.id),
                { segments, speakers },
                before.revision,
              )
            : await this.library.appendSegments(
                this.meetingId,
                segments,
                speakers,
                before.revision,
              );
          if (saved.revision === before.revision) {
            this.lag('lagging', 0);
            break;
          }
          this.lastSavedAtMs = Date.now();
          this.lastRevision = saved.revision;
          publishEdit(before, saved, (name, payload) => this.publish(name, payload));
          if (!this.failed) this.lag(this.pending.length ? 'lagging' : 'ok', 0);
          break;
        } catch (error) {
          if (!(error instanceof StaleRevisionError)) throw error;
          if (attempt === 2) this.lag('lagging', 0);
        }
      }
    }
  }

  private publish<K extends EventName>(name: K, payload: BackendEvents[K]): void {
    try {
      this.emit(name, payload);
      if (name === 'transcriptChanged') this.lastPublishedAtMs = Date.now();
    } catch {
      /* Observers cannot interrupt recording or persistence. */
    }
  }

  private lag(status: 'ok' | 'lagging' | 'failed', lagMs: number): void {
    this.publish('transcriptionLag', { status, lagMs });
  }

  workerFailed(): void {
    if (!this.closed) this.fail();
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.pending.length = 0;
    this.merges.clear();
    this.lag('failed', 0);
  }

  async stop(): Promise<void> {
    this.closed = true;
    await this.draining;
    this.pending.length = 0;
    this.merges.clear();
  }
}
