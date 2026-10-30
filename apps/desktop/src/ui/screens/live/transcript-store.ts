import type {
  Backend,
  MeetingId,
  Speaker,
  TranscriptChanged,
  TranscriptSegment,
  Unsubscribe,
} from '@scrb/contracts';
import { RowHeights } from './row-heights.ts';

export const PAGE_SEGMENTS = 100;

/** A word that stays identifiable while rows are virtualized or replaced by the backend. */
export interface WordRef {
  segmentId: string;
  wordId: string;
  startMs: number;
}

export interface WordPosition {
  segment: number;
  word: number;
}

export type LoadStatus = 'loading' | 'ready' | 'failed';

/**
 * The client-side copy of one meeting's transcript: a sparse list of segments, filled by pages on
 * demand and kept current by `transcriptChanged`. Rendering reads it through `version`, so an
 * incoming change costs one notification rather than a rebuilt transcript.
 */
export class TranscriptStore {
  readonly heights = new RowHeights((index) => {
    const segment = this.segments[index];
    return segment ? { id: segment.id, wordCount: segment.words.length } : null;
  });
  private segments: (TranscriptSegment | undefined)[] = [];
  private readonly indexById = new Map<string, number>();
  private readonly speakers = new Map<string, Speaker>();
  private readonly listeners = new Set<() => void>();
  private readonly loadingPages = new Set<number>();
  private wanted: [first: number, last: number] = [0, 0];
  private revision = -1;
  private version = 0;
  private generation = 0;
  private stopped = false;
  private status: LoadStatus = 'loading';

  constructor(
    private readonly backend: Backend,
    private readonly meetingId: MeetingId,
  ) {}

  /** Begins listening and loading. Returns the function that ends both. */
  start(): Unsubscribe {
    this.stopped = false;
    const unsubscribe = this.backend.on('transcriptChanged', (event) => {
      if (event.meetingId === this.meetingId) this.applyEvent(event);
    });
    void this.reload();
    return () => {
      this.stopped = true;
      unsubscribe();
    };
  }

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  getStatus(): LoadStatus {
    return this.status;
  }

  get rowCount(): number {
    return this.segments.length;
  }

  segmentAt(index: number): TranscriptSegment | undefined {
    return this.segments[index];
  }

  speakerLabel(speakerId: string): string {
    return this.speakers.get(speakerId)?.label ?? 'Unknown speaker';
  }

  /** Asks for the rows on screen. Called freely: pages already held or in flight are skipped. */
  ensureRange(first: number, last: number): void {
    this.wanted = [first, last];
    if (this.revision < 0) return;
    const lastRow = Math.min(last, this.segments.length - 1);
    for (let page = Math.floor(first / PAGE_SEGMENTS); page * PAGE_SEGMENTS <= lastRow; page += 1) {
      this.loadPageIfMissing(page);
    }
    // Live changes land at the tail, so it stays loaded while the user reads older text.
    this.loadPageIfMissing(Math.floor((this.segments.length - 1) / PAGE_SEGMENTS));
  }

  private loadPageIfMissing(page: number): void {
    if (page < 0 || this.loadingPages.has(page)) return;
    const start = page * PAGE_SEGMENTS;
    if (this.segments.slice(start, start + PAGE_SEGMENTS).includes(undefined)) {
      void this.loadPage(page);
    }
  }

  positionOf(ref: WordRef): WordPosition | null {
    const segment = this.indexById.get(ref.segmentId);
    if (segment === undefined) return null;
    const word = this.segments[segment]?.words.findIndex((item) => item.id === ref.wordId) ?? -1;
    return word < 0 ? null : { segment, word };
  }

  refAt({ segment, word }: WordPosition): WordRef | null {
    const row = this.segments[segment];
    const item = row?.words[word];
    return row && item ? { segmentId: row.id, wordId: item.id, startMs: item.startMs } : null;
  }

  /**
   * Finds where a word is now. A replaced word falls back to the word covering the same moment, so
   * a selection stays put when the live pass rewrites text. Null means that moment has no text.
   */
  resolve(ref: WordRef): WordRef | null {
    if (this.positionOf(ref)) return ref;
    const segment = this.loadedSegmentAt(ref.startMs);
    const word = segment?.words.find((item) => item.endMs > ref.startMs);
    return segment && word
      ? { segmentId: segment.id, wordId: word.id, startMs: word.startMs }
      : null;
  }

  /** The text between two positions, skipping any rows not loaded yet. */
  textBetween(first: WordPosition, last: WordPosition): string {
    const parts: string[] = [];
    for (let index = first.segment; index <= last.segment; index += 1) {
      const words = this.segments[index]?.words ?? [];
      const start = index === first.segment ? first.word : 0;
      const end = index === last.segment ? last.word + 1 : words.length;
      parts.push(...words.slice(start, end).map((word) => word.text));
    }
    return parts.join(' ');
  }

  rowContaining(positionMs: number): number | null {
    const segment = this.loadedSegmentAt(positionMs);
    return segment ? (this.indexById.get(segment.id) ?? null) : null;
  }

  private loadedSegmentAt(ms: number): TranscriptSegment | undefined {
    const row = this.findLoadedRowAt(ms);
    return row === null ? undefined : this.segments[row];
  }

  /** Binary search on loaded rows. A probe that lands on a gap walks to the nearest loaded row. */
  private findLoadedRowAt(ms: number): number | null {
    let low = 0;
    let high = this.segments.length - 1;
    while (low <= high) {
      let middle = Math.floor((low + high) / 2);
      while (middle >= low && !this.segments[middle]) middle -= 1;
      if (middle < low) {
        low = Math.floor((low + high) / 2) + 1;
        continue;
      }
      const segment = this.segments[middle] as TranscriptSegment;
      if (ms < segment.startMs) high = middle - 1;
      else if (ms >= segment.endMs) low = middle + 1;
      else return middle;
    }
    return null;
  }

  private async reload(): Promise<void> {
    const generation = (this.generation += 1);
    this.status = 'loading';
    this.loadingPages.clear();
    try {
      const page = await this.backend.call('getTranscript', {
        meetingId: this.meetingId,
        offset: 0,
        limit: PAGE_SEGMENTS,
      });
      if (generation !== this.generation || this.stopped) return;
      this.segments = new Array<TranscriptSegment | undefined>(page.totalSegments).fill(undefined);
      this.indexById.clear();
      this.heights.invalidateFrom(0);
      this.revision = page.revision;
      this.status = 'ready';
      this.addSpeakers(page.speakers);
      this.placeSegments(0, page.segments);
      this.notify();
      this.ensureRange(...this.wanted);
    } catch {
      if (generation !== this.generation || this.stopped) return;
      this.status = 'failed';
      this.notify();
    }
  }

  private async loadPage(page: number): Promise<void> {
    const generation = this.generation;
    this.loadingPages.add(page);
    try {
      const result = await this.backend.call('getTranscript', {
        meetingId: this.meetingId,
        offset: page * PAGE_SEGMENTS,
        limit: PAGE_SEGMENTS,
      });
      if (generation !== this.generation || this.stopped) return;
      this.loadingPages.delete(page);
      // A page from another revision may disagree with events already applied. Dropping it is safe
      // because each applied event asks for the wanted rows again.
      if (result.revision !== this.revision) return;
      this.addSpeakers(result.speakers);
      this.placeSegments(page * PAGE_SEGMENTS, result.segments);
      this.heights.invalidateFrom(page * PAGE_SEGMENTS);
      this.notify();
    } catch {
      if (generation === this.generation) this.loadingPages.delete(page);
    }
  }

  private applyEvent(event: TranscriptChanged): void {
    if (this.revision < 0 || event.revision <= this.revision) return;
    if (event.revision !== this.revision + 1) {
      void this.reload();
      return;
    }
    this.revision = event.revision;
    this.addSpeakers(event.speakers);
    const { change } = event;
    let applied = true;
    if (change.kind === 'append') {
      this.placeSegments(this.segments.length, change.segments);
    } else if (change.kind === 'replace') {
      applied = this.applyReplace(change.segments, change.removedSegmentIds);
    } else {
      this.applyRealign(change.words);
    }
    if (!applied) {
      void this.reload();
      return;
    }
    this.notify();
    this.ensureRange(...this.wanted);
  }

  /** Returns false when the change touches rows not held here, so positions cannot be trusted. */
  private applyReplace(segments: TranscriptSegment[], removedIds: string[]): boolean {
    const replacedIds = new Set(segments.map((segment) => segment.id));
    const removals = removedIds.filter((id) => !replacedIds.has(id));
    const rows = removals.map((id) => this.indexById.get(id));
    if (rows.includes(undefined)) return false;
    const descending = (rows as number[]).toSorted((a, b) => b - a);
    for (const row of descending) this.segments.splice(row, 1);
    for (const id of removals) this.indexById.delete(id);
    if (descending.length > 0) this.reindexFrom(descending.at(-1) as number);

    for (const segment of segments) {
      const existing = this.indexById.get(segment.id);
      if (existing !== undefined) {
        this.segments[existing] = segment;
        this.heights.invalidateFrom(existing);
        continue;
      }
      const row = this.insertionRow(segment.startMs);
      if (row === null) return false;
      this.segments.splice(row, 0, segment);
      this.reindexFrom(row);
    }
    return true;
  }

  /** Null when the row is beside unloaded rows, where its true neighbours are unknown. */
  private insertionRow(startMs: number): number | null {
    let row = this.segments.length;
    while (row > 0) {
      const previous = this.segments[row - 1];
      if (!previous) return null;
      if (previous.startMs <= startMs) return row;
      row -= 1;
    }
    return row;
  }

  private applyRealign(words: { id: string; startMs: number; endMs: number }[]): void {
    const timings = new Map(words.map((word) => [word.id, word]));
    this.segments.forEach((segment, index) => {
      if (!segment?.words.some((word) => timings.has(word.id))) return;
      this.segments[index] = {
        ...segment,
        words: segment.words.map((word) => ({ ...word, ...timings.get(word.id) })),
      };
    });
  }

  private placeSegments(offset: number, segments: TranscriptSegment[]): void {
    segments.forEach((segment, index) => {
      this.segments[offset + index] = segment;
      this.indexById.set(segment.id, offset + index);
    });
  }

  private reindexFrom(first: number): void {
    this.heights.invalidateFrom(first);
    for (let index = first; index < this.segments.length; index += 1) {
      const segment = this.segments[index];
      if (segment) this.indexById.set(segment.id, index);
    }
  }

  private addSpeakers(speakers: Speaker[]): void {
    for (const speaker of speakers) this.speakers.set(speaker.id, speaker);
  }

  private notify(): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
}
