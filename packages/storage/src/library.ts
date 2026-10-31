import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AtomicWriteOptions } from './atomic.ts';
import { atomicWriteFile, removeTempFiles } from './atomic.ts';
import * as corrections from './corrections.ts';
import type { CorrectionInput, ModelReplacement } from './corrections.ts';
import { openIndex, type DatabaseSync } from './db/database.ts';
import {
  deleteMeetingRows,
  findMeetingRows,
  getMeetingRow,
  indexTraces,
  listMeetingRows,
  upsertMeeting,
  type MeetingRow,
} from './db/meetings-index.ts';
import { SettingsStore, type AutoDeletePeriod } from './db/settings.ts';
import { VocabularyStore, type VocabularyContextRef } from './db/vocabulary.ts';
import { VoiceProfileStore } from './db/voice-profiles.ts';
import { MeetingNotFoundError, StaleRevisionError, StorageError } from './errors.ts';
import {
  MEETING_FORMAT,
  type MeetingMeta,
  type MeetingSource,
  type MeetingStatus,
} from './formats/meeting.ts';
import { mergeRegeneratedSummary, SUMMARY_FORMAT, type SummaryFile } from './formats/summary.ts';
import {
  emptyTranscript,
  TRANSCRIPT_FORMAT,
  type Correction,
  type Segment,
  type Speaker,
  type TranscriptFile,
} from './formats/transcript.ts';
import { loadDocument, saveDocument } from './formats/versioned.ts';
import {
  DELETING_PREFIX,
  libraryPaths,
  meetingCachePath,
  meetingFolderName,
  meetingFolderPath,
  meetingPaths,
  type LibraryPaths,
  type MeetingPaths,
} from './layout.ts';
import { errorFields, Logger } from './logs.ts';
import { searchTranscript, type TranscriptHit } from './search.ts';

const DAY_MS = 86_400_000;
const SEARCH_CONCURRENCY = 4;
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;
const PERIOD_DAYS: Record<Exclude<AutoDeletePeriod, 'never'>, number> = {
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '1y': 365,
};
/** Meetings still being made are never old enough to delete. */
const RETAINED_STATUSES: readonly MeetingStatus[] = ['ready', 'recovered'];

export interface CreateMeetingInput {
  title: string;
  date?: string;
  source?: MeetingSource;
  status?: MeetingStatus;
  durationMs?: number;
  buildVoiceProfiles?: boolean;
}

export type MeetingChanges = Partial<
  Pick<
    MeetingMeta,
    'title' | 'date' | 'durationMs' | 'status' | 'buildVoiceProfiles' | 'transcriptionFailure'
  >
>;

export interface DeleteReport {
  meetingId: string;
  /** True only when every check found nothing left. */
  ok: boolean;
  /** What is still there: file paths for the UI, or `index:<table>`. Never log these. */
  remaining: string[];
}

export interface AutoDeleteRun {
  scope: 'audio' | 'meeting';
  /** Skipped while a recording runs; the next run picks the work up. */
  deferred: boolean;
  results: DeleteReport[];
}

export interface ReconcileReport {
  added: string[];
  removed: string[];
  updated: string[];
  /** Interrupted imports removed: the user's original file is untouched. */
  discardedImports: string[];
  /** Deletes a crash cut short and this run finished. */
  finishedDeletes: string[];
  /** Status still `recording`: the capture layer owns recovering these. */
  interruptedRecordings: string[];
  /** Status still `finalPassRunning`: the app quit or crashed during the pass. */
  interruptedFinalPasses: string[];
  /** Folders with no readable meeting.json. Kept and not indexed, as they may hold audio. */
  unreadableFolders: string[];
}

export interface SearchResult {
  meeting: MeetingRow;
  matchedIn: ('title or date' | 'transcript')[];
  hits: TranscriptHit[];
  hitCount: number;
}

export interface SearchOutcome {
  results: SearchResult[];
  /** Meetings whose transcript could not be read, so the results may be incomplete. */
  skippedMeetingIds: string[];
}

export interface SearchOptions {
  fromDate?: string;
  toDate?: string;
  hitsPerMeeting?: number;
  signal?: AbortSignal;
}

export interface LibraryOptions {
  root: string;
  now?: () => Date;
  logger?: Logger;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function hasAnyFile(dir: string): Promise<boolean> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) return true;
    if (await hasAnyFile(path.join(dir, entry.name))) return true;
  }
  return false;
}

function isAlive(correction: Correction | undefined): boolean {
  return correction !== undefined && correction.state === 'active';
}

/**
 * One library folder. The meeting folder is the true copy: every change lands there first and
 * the index follows, so a crash between the two is repaired by `reconcile` on the next open.
 * All writes to one meeting run one at a time, so a slow final pass cannot overwrite an edit.
 */
export class Library {
  readonly paths: LibraryPaths;
  readonly settings: SettingsStore;
  readonly vocabulary: VocabularyStore;
  readonly voiceProfiles: VoiceProfileStore;
  readonly logger: Logger;
  /** Where a corrupt index was moved. Vocabulary and voice profiles must be rebuilt if set. */
  readonly replacedCorruptIndex: string | null;
  /** What the repair on open found. */
  readonly openReport: ReconcileReport;

  private readonly db: DatabaseSync;
  private readonly clock: () => Date;
  private readonly locks = new Map<string, Promise<unknown>>();
  private scheduledDeletion: Promise<void> = Promise.resolve();

  private constructor(
    paths: LibraryPaths,
    db: DatabaseSync,
    logger: Logger,
    clock: () => Date,
    replacedCorruptIndex: string | null,
  ) {
    this.paths = paths;
    this.db = db;
    this.logger = logger;
    this.clock = clock;
    this.replacedCorruptIndex = replacedCorruptIndex;
    const now = (): string => clock().toISOString();
    this.settings = new SettingsStore(db);
    this.vocabulary = new VocabularyStore(db, now);
    this.voiceProfiles = new VoiceProfileStore(db, now);
    this.openReport = {
      added: [],
      removed: [],
      updated: [],
      discardedImports: [],
      finishedDeletes: [],
      interruptedRecordings: [],
      interruptedFinalPasses: [],
      unreadableFolders: [],
    };
  }

  static async open(options: LibraryOptions): Promise<Library> {
    const paths = libraryPaths(options.root);
    await Promise.all(
      [paths.meetings, paths.models, paths.logs, paths.cache].map((dir) =>
        fs.mkdir(dir, { recursive: true }),
      ),
    );
    const clock = options.now ?? (() => new Date());
    const logger = options.logger ?? new Logger(paths.logs, clock);
    const { db, replacedCorruptIndex } = await openIndex(paths.index);
    const library = new Library(paths, db, logger, clock, replacedCorruptIndex);
    Object.assign(library.openReport, await library.reconcile());
    await library.repairVocabulary();
    await logger.prune();
    logger.log('info', 'library-opened', { corruptIndexReplaced: replacedCorruptIndex !== null });
    return library;
  }

  async close(): Promise<void> {
    await this.scheduledDeletion;
    await Promise.allSettled(this.locks.values());
    this.db.close();
    await this.logger.flush();
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }

  private withLock<T>(meetingId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(meetingId) ?? Promise.resolve();
    const run = previous.then(work, work);
    const settled = run.catch(() => undefined);
    this.locks.set(meetingId, settled);
    void settled.then(() => {
      if (this.locks.get(meetingId) === settled) this.locks.delete(meetingId);
    });
    return run;
  }

  private requireRow(meetingId: string): MeetingRow {
    const row = getMeetingRow(this.db, meetingId);
    if (row === null) throw new MeetingNotFoundError(meetingId);
    return row;
  }

  /** Paths inside a meeting, for the capture, export and open-folder code. */
  /** Scratch space outside the meeting folder, removed with the meeting. */
  meetingCache(meetingId: string): string {
    this.requireRow(meetingId);
    return meetingCachePath(this.paths, meetingId);
  }

  meetingPaths(meetingId: string): MeetingPaths {
    const row = this.requireRow(meetingId);
    return meetingPaths(meetingFolderPath(this.paths, row.folder));
  }

  async createMeeting(input: CreateMeetingInput): Promise<MeetingMeta> {
    const createdAt = this.nowIso();
    const meta: MeetingMeta = {
      schemaVersion: 1,
      id: randomUUID(),
      title: input.title,
      date: input.date ?? createdAt,
      createdAt,
      durationMs: input.durationMs ?? 0,
      source: input.source ?? 'recorded',
      status: input.status ?? 'ready',
      audioDeletedAt: null,
      buildVoiceProfiles: input.buildVoiceProfiles ?? false,
    };
    const folder = await this.makeMeetingFolder(meetingFolderName(meta.date, meta.title));
    const files = meetingPaths(meetingFolderPath(this.paths, folder));
    await Promise.all(
      [files.audioMicrophone, files.audioMeeting, files.exports].map((dir) =>
        fs.mkdir(dir, { recursive: true }),
      ),
    );
    await saveDocument(files.meta, meta, null);
    upsertMeeting(this.db, meta, folder);
    this.logger.log('info', 'meeting-created', { meetingId: meta.id, source: meta.source });
    return meta;
  }

  private async makeMeetingFolder(base: string): Promise<string> {
    for (let attempt = 1; ; attempt += 1) {
      const name = attempt === 1 ? base : `${base} (${attempt})`;
      try {
        await fs.mkdir(meetingFolderPath(this.paths, name));
        return name;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
  }

  async getMeeting(meetingId: string): Promise<MeetingMeta> {
    const loaded = await loadDocument(MEETING_FORMAT, this.meetingPaths(meetingId).meta);
    if (loaded === null) throw new MeetingNotFoundError(meetingId);
    return loaded.doc;
  }

  listMeetings(): MeetingRow[] {
    return listMeetingRows(this.db);
  }

  /** The folder keeps its first name; titles change here, so open handles stay valid. */
  updateMeeting(meetingId: string, changes: MeetingChanges): Promise<MeetingMeta> {
    return this.withLock(meetingId, () => this.writeMeta(meetingId, changes));
  }

  private async writeMeta(meetingId: string, changes: Partial<MeetingMeta>): Promise<MeetingMeta> {
    const row = this.requireRow(meetingId);
    const file = this.meetingPaths(meetingId).meta;
    const loaded = await loadDocument(MEETING_FORMAT, file);
    if (loaded === null) throw new MeetingNotFoundError(meetingId);
    const next = { ...loaded.doc, ...changes };
    await saveDocument(file, next, loaded.fileVersion);
    upsertMeeting(this.db, next, row.folder);
    return next;
  }

  async readTranscript(meetingId: string): Promise<TranscriptFile> {
    const loaded = await loadDocument(TRANSCRIPT_FORMAT, this.meetingPaths(meetingId).transcript);
    return loaded?.doc ?? emptyTranscript(meetingId);
  }

  private async changeTranscript(
    meetingId: string,
    change: (current: TranscriptFile) => TranscriptFile,
    options: { userEdit: boolean; expectedRevision?: number; write?: AtomicWriteOptions },
  ): Promise<TranscriptFile> {
    return this.withLock(meetingId, async () => {
      const file = this.meetingPaths(meetingId).transcript;
      const loaded = await loadDocument(TRANSCRIPT_FORMAT, file);
      const current = loaded?.doc ?? emptyTranscript(meetingId);
      const { expectedRevision } = options;
      if (expectedRevision !== undefined && expectedRevision !== current.revision) {
        throw new StaleRevisionError(expectedRevision, current.revision);
      }
      const changed = change(current);
      if (changed === current) return current;
      // Flag first: after a crash a false "may be outdated" is harmless; a missing one is not.
      if (options.userEdit) await this.flagSummaryOutdated(meetingId);
      const next = { ...changed, revision: current.revision + 1 };
      const learningChanged = current.corrections !== next.corrections;
      if (learningChanged) this.settings.set(`vocabulary.pending.${meetingId}`, true);
      await saveDocument(file, next, loaded?.fileVersion ?? null, options.write);
      if (learningChanged) {
        try {
          this.syncVocabulary(meetingId, current, next);
          this.settings.delete(`vocabulary.pending.${meetingId}`);
        } catch (error) {
          // User corrections are saved before vocabulary; repair later, never roll back the edit.
          this.logger.log('warn', 'vocabulary-learning-pending', {
            meetingId,
            ...errorFields(error),
          });
        }
      }
      return next;
    });
  }

  /** Whole-file save. Pass the revision you read, or a newer file is refused, not overwritten. */
  saveTranscript(
    meetingId: string,
    transcript: TranscriptFile,
    expectedRevision: number,
    write: AtomicWriteOptions = {},
  ): Promise<TranscriptFile> {
    return this.changeTranscript(meetingId, () => transcript, {
      userEdit: false,
      expectedRevision,
      write,
    });
  }

  appendSegments(
    meetingId: string,
    segments: Segment[],
    speakers: Speaker[] = [],
  ): Promise<TranscriptFile> {
    return this.changeTranscript(
      meetingId,
      (current) => corrections.appendSegments(current, segments, speakers),
      { userEdit: false },
    );
  }

  replaceLiveSegments(
    meetingId: string,
    segmentIds: string[],
    incoming: ModelReplacement,
  ): Promise<TranscriptFile> {
    return this.changeTranscript(
      meetingId,
      (current) => corrections.replaceLiveSegments(current, segmentIds, incoming),
      { userEdit: false },
    );
  }

  /** Reads the latest file under the lock, so corrections made during the pass are kept too. */
  applyFinalPass(meetingId: string, incoming: ModelReplacement): Promise<TranscriptFile> {
    return this.changeTranscript(
      meetingId,
      (current) => corrections.applyFinalPass(current, incoming),
      { userEdit: true },
    );
  }

  async applyCorrection(meetingId: string, input: CorrectionInput): Promise<TranscriptFile> {
    return this.changeTranscript(
      meetingId,
      (current) => corrections.applyCorrection(current, input).transcript,
      { userEdit: true },
    );
  }

  revertCorrection(meetingId: string, correctionId: string): Promise<TranscriptFile> {
    return this.edit(meetingId, (t) =>
      corrections.revertCorrection(t, correctionId, this.nowIso()),
    );
  }

  renameSpeaker(meetingId: string, speakerId: string, name: string): Promise<TranscriptFile> {
    return this.edit(meetingId, (t) => corrections.renameSpeaker(t, speakerId, name));
  }

  mergeSpeakers(meetingId: string, fromId: string, intoId: string): Promise<TranscriptFile> {
    return this.edit(meetingId, (t) => corrections.mergeSpeakers(t, fromId, intoId));
  }

  reassignSpeaker(
    meetingId: string,
    wordIds: string[],
    speakerId: string,
  ): Promise<TranscriptFile> {
    return this.edit(meetingId, (t) => corrections.reassignSpeaker(t, wordIds, speakerId));
  }

  undo(meetingId: string): Promise<TranscriptFile> {
    return this.edit(meetingId, corrections.undo);
  }

  redo(meetingId: string): Promise<TranscriptFile> {
    return this.edit(meetingId, corrections.redo);
  }

  private edit(
    meetingId: string,
    change: (current: TranscriptFile) => TranscriptFile,
  ): Promise<TranscriptFile> {
    return this.changeTranscript(meetingId, change, { userEdit: true });
  }

  /** Keeps the Vocabulary list in step with "Remember correction", through undo and redo. */
  private syncVocabulary(meetingId: string, before: TranscriptFile, after: TranscriptFile): void {
    if (before.corrections === after.corrections) return;
    const old = new Map(before.corrections.map((c) => [c.id, c]));
    const seen = new Set<string>();
    for (const correction of after.corrections) {
      seen.add(correction.id);
      const previous = old.get(correction.id);
      if (previous === correction) continue;
      const wasKept = isAlive(previous) && previous?.remember === true;
      const isKept = isAlive(correction) && correction.remember;
      const sameTerm = previous?.replacement === correction.replacement;
      if (wasKept && (!isKept || !sameTerm)) {
        this.vocabulary.forgetCorrection(correction.id, correction.original.text);
      }
      if (isKept && (!wasKept || !sameTerm) && correction.replacement.trim() !== '') {
        this.vocabulary.remember({
          term: correction.replacement,
          misheard: [correction.original.text],
          context: { meetingId, correctionId: correction.id },
        });
      }
    }
    for (const previous of before.corrections) {
      if (!seen.has(previous.id) && previous.remember && isAlive(previous)) {
        this.vocabulary.forgetCorrection(previous.id, previous.original.text);
      }
    }
  }

  /** Repairs pending links; a one-time full scan covers older interrupted saves. */
  private async repairVocabulary(): Promise<void> {
    const initialized = this.settings.get('vocabulary.repairInitialized', false);
    const pending = this.settings.all();
    for (const row of this.listMeetings()) {
      const key = `vocabulary.pending.${row.id}`;
      if (initialized && pending[key] !== true) continue;
      let transcript: TranscriptFile;
      try {
        transcript = await this.readTranscript(row.id);
      } catch (error) {
        this.settings.set(key, true);
        this.logger.log('warn', 'vocabulary-repair-deferred', {
          meetingId: row.id,
          ...errorFields(error),
        });
        continue;
      }
      try {
        const active = new Map(
          transcript.corrections
            .filter((c) => c.state === 'active' && c.remember && c.replacement.trim() !== '')
            .map((c) => [c.id, c]),
        );
        for (const term of this.vocabulary.list()) {
          for (const context of term.contexts.filter((c) => c.meetingId === row.id)) {
            if (!active.has(context.correctionId)) {
              const gone = transcript.corrections.find((c) => c.id === context.correctionId);
              this.vocabulary.forgetCorrection(context.correctionId, gone?.original.text ?? '');
            }
          }
        }
        for (const correction of active.values()) {
          this.vocabulary.reconcileRemember({
            term: correction.replacement,
            misheard: [correction.original.text],
            context: { meetingId: row.id, correctionId: correction.id },
          });
        }
        this.settings.delete(key);
      } catch (error) {
        this.settings.set(key, true);
        this.logger.log('warn', 'vocabulary-repair-deferred', {
          meetingId: row.id,
          ...errorFields(error),
        });
      }
    }
    this.settings.set('vocabulary.repairInitialized', true);
  }

  /** The words around a remembered correction, read from its meeting's file. */
  async vocabularyContext(
    ref: VocabularyContextRef,
    wordsEachSide = 6,
  ): Promise<{ before: string; after: string } | null> {
    if (getMeetingRow(this.db, ref.meetingId) === null) return null;
    const transcript = await this.readTranscript(ref.meetingId);
    const tokens = corrections.resolveDisplay(transcript).flatMap((segment) => segment.tokens);
    const at = tokens.findIndex((token) => token.correctionId === ref.correctionId);
    if (at === -1) return null;
    const join = (from: number, to: number): string =>
      tokens
        .slice(Math.max(0, from), to)
        .map((token) => token.text)
        .join(' ');
    return { before: join(at - wordsEachSide, at), after: join(at + 1, at + 1 + wordsEachSide) };
  }

  async readSummary(meetingId: string): Promise<SummaryFile | null> {
    const loaded = await loadDocument(SUMMARY_FORMAT, this.meetingPaths(meetingId).summary);
    return loaded?.doc ?? null;
  }

  private async flagSummaryOutdated(meetingId: string): Promise<void> {
    const file = this.meetingPaths(meetingId).summary;
    const loaded = await loadDocument(SUMMARY_FORMAT, file);
    if (loaded === null || loaded.doc.outdated) return;
    const next = { ...loaded.doc, outdated: true, revision: loaded.doc.revision + 1 };
    await saveDocument(file, next, loaded.fileVersion);
  }

  /** Saves a user edit to the summary. Mark edited items `edited: true` to protect them. */
  updateSummary(
    meetingId: string,
    change: (current: SummaryFile) => SummaryFile,
  ): Promise<SummaryFile> {
    return this.withLock(meetingId, async () => {
      const file = this.meetingPaths(meetingId).summary;
      const loaded = await loadDocument(SUMMARY_FORMAT, file);
      if (loaded === null) throw new StorageError('NO_SUMMARY', 'This meeting has no summary');
      const next = { ...change(loaded.doc), revision: loaded.doc.revision + 1 };
      await saveDocument(file, next, loaded.fileVersion);
      return next;
    });
  }

  /** Stores a generated summary. User-edited items carry over and the outdated flag clears. */
  saveGeneratedSummary(
    meetingId: string,
    generated: Omit<
      SummaryFile,
      'schemaVersion' | 'meetingId' | 'revision' | 'outdated' | 'transcriptRevision'
    >,
  ): Promise<SummaryFile> {
    return this.withLock(meetingId, async () => {
      const file = this.meetingPaths(meetingId).summary;
      const loaded = await loadDocument(SUMMARY_FORMAT, file);
      const transcript = await this.readTranscript(meetingId);
      const fresh: SummaryFile = {
        ...generated,
        schemaVersion: 3,
        meetingId,
        revision: 0,
        transcriptRevision: transcript.revision,
        outdated: false,
      };
      const merged = mergeRegeneratedSummary(loaded?.doc ?? null, fresh);
      const next = { ...merged, revision: merged.revision + 1 };
      await saveDocument(file, next, loaded?.fileVersion ?? null);
      return next;
    });
  }

  /** Title and date come from the index; transcript text comes from reading each file. */
  async search(query: string, options: SearchOptions = {}): Promise<SearchOutcome> {
    const dates = {
      ...(options.fromDate !== undefined && { fromDate: options.fromDate }),
      ...(options.toDate !== undefined && { toDate: options.toDate }),
    };
    const rows = findMeetingRows(this.db, dates).filter((row) => row.status !== 'importing');
    const trimmed = query.trim();
    const indexed = new Set(
      findMeetingRows(this.db, { ...dates, text: trimmed }).map((row) => row.id),
    );
    const found = new Map<string, SearchResult>();
    const skippedMeetingIds: string[] = [];
    const limit = options.hitsPerMeeting ?? 20;

    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < rows.length) {
        if (options.signal?.aborted === true) return;
        const row = rows[next] as MeetingRow;
        next += 1;
        const matchedIn: SearchResult['matchedIn'] = indexed.has(row.id) ? ['title or date'] : [];
        let hits: TranscriptHit[] = [];
        let hitCount = 0;
        try {
          ({ hits, total: hitCount } = searchTranscript(
            await this.readTranscript(row.id),
            trimmed,
            limit,
          ));
        } catch (error) {
          skippedMeetingIds.push(row.id);
          this.logger.log('warn', 'search-skipped-meeting', {
            meetingId: row.id,
            ...errorFields(error),
          });
        }
        if (hitCount > 0) matchedIn.push('transcript');
        if (matchedIn.length > 0) found.set(row.id, { meeting: row, matchedIn, hits, hitCount });
      }
    };
    await Promise.all(Array.from({ length: SEARCH_CONCURRENCY }, worker));
    // Keep the list's own order, whatever order the files finished reading.
    const results = rows.flatMap((row) => found.get(row.id) ?? []);
    return { results, skippedMeetingIds };
  }

  /**
   * Removes the folder, index entries and cached files, then checks that nothing remains.
   * The folder is first renamed away in one step, so a crash leaves either a whole meeting or a
   * `.deleting-` folder that the next open finishes, never a half-deleted meeting in the list.
   * On failure nothing is reported as gone: `ok` is false and `remaining` says what is left.
   */
  deleteMeeting(meetingId: string, importCleanup = false): Promise<DeleteReport> {
    return this.withLock(meetingId, async () => {
      const row = this.requireRow(meetingId);
      await this.assertDeletionIdle(row, importCleanup);
      const remaining = await this.removeMeeting(meetingId, row.folder);
      const ok = remaining.length === 0;
      this.logger.log(ok ? 'info' : 'error', 'meeting-deleted', {
        meetingId,
        ok,
        leftCount: remaining.length,
      });
      return { meetingId, ok, remaining };
    });
  }

  /** Conservatively refuse deletion whenever a writer may still own the meeting. */
  private async assertDeletionIdle(row: MeetingRow, importCleanup = false): Promise<void> {
    if (
      row.status === 'recording' ||
      (row.status === 'importing' && !importCleanup) ||
      row.status === 'finalPassRunning'
    ) {
      throw new StorageError('ACTIVE_MEETING', 'Stop the meeting operation before deleting.');
    }
    const lock = path.join(meetingFolderPath(this.paths, row.folder), 'audio', 'writer.lock');
    if (await exists(lock)) {
      throw new StorageError('ACTIVE_MEETING', 'Audio recording may still be writing.');
    }
  }

  /** Cancels an import. The user's original file is outside the library and is not touched. */
  discardImport(meetingId: string): Promise<DeleteReport> {
    return this.deleteMeeting(meetingId, true);
  }

  private async removeMeeting(meetingId: string, folderName: string): Promise<string[]> {
    const folder = meetingFolderPath(this.paths, folderName);
    const trash = path.join(this.paths.meetings, `${DELETING_PREFIX}${meetingId}`);
    const cache = meetingCachePath(this.paths, meetingId);
    const problems: string[] = [];

    let movedFromLibrary = false;
    try {
      if (await exists(folder)) await fs.rename(folder, trash);
      movedFromLibrary = true;
    } catch (error) {
      this.logger.log('error', 'meeting-delete-step-failed', errorFields(error));
    }
    if (movedFromLibrary) {
      try {
        await fs.rm(trash, RM_OPTIONS);
      } catch (error) {
        this.logger.log('error', 'meeting-delete-step-failed', errorFields(error));
      }
    }
    await fs.rm(cache, RM_OPTIONS).catch((error: unknown) => {
      this.logger.log('error', 'meeting-delete-step-failed', errorFields(error));
    });
    // The list must not offer a meeting whose folder has gone, and must not lose one still there.
    if (movedFromLibrary) {
      deleteMeetingRows(this.db, meetingId);
      this.settings.delete(`vocabulary.pending.${meetingId}`);
    }

    for (const target of [folder, trash, cache]) {
      if (await exists(target)) problems.push(target);
    }
    problems.push(...indexTraces(this.db, meetingId));
    problems.push(...(await this.foldersHolding(meetingId)));
    return [...new Set(problems)];
  }

  /** Copies the user made count as "left behind", so the check looks at every meeting.json. */
  private async foldersHolding(meetingId: string): Promise<string[]> {
    const names = await fs.readdir(this.paths.meetings);
    const found: string[] = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const folder = meetingFolderPath(this.paths, name);
      const loaded = await loadDocument(MEETING_FORMAT, meetingPaths(folder).meta).catch(
        () => null,
      );
      if (loaded?.doc.id === meetingId) found.push(folder);
    }
    return found;
  }

  /** Removes a meeting's audio and anything derived from it. Transcript and summary stay. */
  deleteAudio(meetingId: string): Promise<DeleteReport> {
    return this.withLock(meetingId, async () => {
      const row = this.requireRow(meetingId);
      await this.assertDeletionIdle(row);
      const files = this.meetingPaths(meetingId);
      const cache = meetingCachePath(this.paths, meetingId);
      const remaining: string[] = [];
      for (const target of [files.audio, cache]) {
        try {
          await fs.rm(target, RM_OPTIONS);
        } catch (error) {
          this.logger.log('error', 'audio-delete-step-failed', errorFields(error));
        }
        if (await exists(target)) remaining.push(target);
      }
      const ok = remaining.length === 0;
      if (ok && row.audioDeletedAt === null) {
        await this.writeMeta(meetingId, { audioDeletedAt: this.nowIso() });
      }
      this.logger.log(ok ? 'info' : 'error', 'audio-deleted', { meetingId, ok });
      return { meetingId, ok, remaining };
    });
  }

  /** What auto-delete would remove now. For the Settings screen to show before a change. */
  previewAutoDelete(): MeetingRow[] {
    const { period, scope } = this.settings.getAutoDelete();
    if (period === 'never') return [];
    const cutoff = this.clock().getTime() - PERIOD_DAYS[period] * DAY_MS;
    return this.listMeetings().filter((row) => {
      // Counts from when the meeting entered the library: an imported file can have an old date.
      const created = Date.parse(row.createdAt);
      if (Number.isNaN(created) || created > cutoff) return false;
      if (!RETAINED_STATUSES.includes(row.status)) return false;
      return scope === 'meeting' || row.audioDeletedAt === null;
    });
  }

  /** Waits out any recording, which has priority over disk work. */
  async runAutoDelete(): Promise<AutoDeleteRun> {
    const { scope } = this.settings.getAutoDelete();
    if (this.listMeetings().some((row) => row.status === 'recording')) {
      return { scope, deferred: true, results: [] };
    }
    const results: DeleteReport[] = [];
    for (const row of this.previewAutoDelete()) {
      try {
        const remove = scope === 'audio' ? this.deleteAudio(row.id) : this.deleteMeeting(row.id);
        results.push(await remove);
      } catch (error) {
        this.logger.log('error', 'auto-delete-failed', {
          meetingId: row.id,
          ...errorFields(error),
        });
        results.push({ meetingId: row.id, ok: false, remaining: [row.folder] });
      }
    }
    return { scope, deferred: false, results };
  }

  /** Runs now and then on a timer. Returns a stop function. */
  startAutoDeleteSchedule(intervalMs = 6 * 3_600_000): () => void {
    let running = false;
    const tick = (): void => {
      if (running) return;
      running = true;
      this.scheduledDeletion = this.runAutoDelete()
        .then(() => undefined)
        .catch((error: unknown) => {
          this.logger.log('error', 'auto-delete-failed', errorFields(error));
        })
        .finally(() => {
          running = false;
        });
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  /** Brings the index back in line with the folders, which win any disagreement. */
  async reconcile(): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      added: [],
      removed: [],
      updated: [],
      discardedImports: [],
      finishedDeletes: [],
      interruptedRecordings: [],
      interruptedFinalPasses: [],
      unreadableFolders: [],
    };
    await removeTempFiles(this.paths.root);
    const seen = new Map<string, { meta: MeetingMeta; folder: string }>();

    for (const entry of await fs.readdir(this.paths.meetings, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith(DELETING_PREFIX)) {
        const meetingId = name.slice(DELETING_PREFIX.length);
        await fs.rm(path.join(this.paths.meetings, name), RM_OPTIONS);
        deleteMeetingRows(this.db, meetingId);
        await fs.rm(meetingCachePath(this.paths, meetingId), RM_OPTIONS);
        report.finishedDeletes.push(meetingId);
        continue;
      }
      if (name.startsWith('.')) continue;

      const folder = meetingFolderPath(this.paths, name);
      await removeTempFiles(folder);
      let meta: MeetingMeta | null;
      try {
        meta = (await loadDocument(MEETING_FORMAT, meetingPaths(folder).meta))?.doc ?? null;
      } catch {
        report.unreadableFolders.push(name);
        continue;
      }
      if (meta === null) {
        // A crash during create leaves empty folders; anything else might be someone's audio.
        if (await hasAnyFile(folder)) report.unreadableFolders.push(name);
        else await fs.rm(folder, RM_OPTIONS);
        continue;
      }
      if (seen.has(meta.id)) {
        report.unreadableFolders.push(name);
        continue;
      }
      seen.set(meta.id, { meta, folder: name });
    }

    for (const row of this.listMeetings()) {
      if (!seen.has(row.id)) {
        deleteMeetingRows(this.db, row.id);
        await fs.rm(meetingCachePath(this.paths, row.id), RM_OPTIONS);
        report.removed.push(row.id);
      }
    }
    for (const { meta, folder } of seen.values()) {
      if (meta.status === 'importing') {
        await this.removeMeeting(meta.id, folder);
        report.discardedImports.push(meta.id);
        continue;
      }
      if (meta.status === 'recording') report.interruptedRecordings.push(meta.id);
      if (meta.status === 'finalPassRunning') report.interruptedFinalPasses.push(meta.id);
      const row = getMeetingRow(this.db, meta.id);
      if (row === null) report.added.push(meta.id);
      else if (
        row.folder !== folder ||
        row.title !== meta.title ||
        row.date !== meta.date ||
        row.status !== meta.status ||
        row.durationMs !== meta.durationMs ||
        row.audioDeletedAt !== meta.audioDeletedAt
      ) {
        report.updated.push(meta.id);
      }
      upsertMeeting(this.db, meta, folder);
    }

    // Cached files of meetings that no longer exist.
    for (const name of await fs.readdir(this.paths.cache)) {
      if (!seen.has(name)) await fs.rm(path.join(this.paths.cache, name), RM_OPTIONS);
    }
    this.logger.log('info', 'library-reconciled', {
      added: report.added.length,
      removed: report.removed.length,
      updated: report.updated.length,
      unreadable: report.unreadableFolders.length,
    });
    return report;
  }
}

/** Points at the library, which the user can place anywhere; lives in the app's config folder. */
export async function readLibraryLocation(configDir: string, defaultRoot: string): Promise<string> {
  try {
    const text = await fs.readFile(path.join(configDir, 'library-location.json'), 'utf8');
    const { root } = JSON.parse(text) as { root?: unknown };
    return typeof root === 'string' && root !== '' ? root : defaultRoot;
  } catch {
    return defaultRoot;
  }
}

export async function writeLibraryLocation(configDir: string, root: string): Promise<void> {
  await fs.mkdir(configDir, { recursive: true });
  await atomicWriteFile(path.join(configDir, 'library-location.json'), JSON.stringify({ root }));
}
