import { realpath } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { sep } from 'node:path';
import {
  applySummaryUpdate,
  readSealedGaps,
  toSummaryDoc,
  MISSING_TOOLS_MESSAGE,
  NOT_ENABLED_MESSAGE,
  WORKER_FAILED_MESSAGE,
  YOU_ID,
  sealedTracks,
  type FinalPassQueue,
} from '@scrb/app-core';
import {
  ContractError,
  matchesMeetingFilter,
  type BackendEvents,
  type EventName,
  type WordRange,
  type MeetingDetail,
  type MeetingFilter,
  type MeetingListItem,
  type MeetingStatus,
  type SummaryItemUpdate,
  type VocabularyTerm as ContractTerm,
  type VocabularyTermPatch,
  type Speaker as ContractSpeaker,
  type TimelineGap,
  type TranscriptPage,
  type TranscriptSegment,
} from '@scrb/contracts';
import {
  activeSpeakers,
  CorrectionConflictError,
  errorFields,
  MeetingNotFoundError,
  StorageError,
  resolveDisplay,
  type DisplaySegment,
  type Library,
  meetingCachePath,
  type VocabularyTerm as VocabularyEntry,
  type MeetingMeta,
  type MeetingRow,
  type Speaker,
  type TranscriptFile,
} from '@scrb/storage';
import type { CallHandlers } from './dispatch.ts';

const NS_PER_MS = 1e6;
type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;

/** Resolve inclusive visible endpoints back to the original words, never a guessed time range. */
function selectedWordIds(t: TranscriptFile, range: WordRange): string[] {
  const displayed = resolveDisplay(t).flatMap((segment) =>
    segment.tokens.map((token) => ({ track: segment.track, token })),
  );
  const start = displayed.findIndex((entry) => entry.token.wordIds[0] === range.firstWordId);
  const end = displayed.findIndex((entry) => entry.token.wordIds[0] === range.lastWordId);
  if (start < 0 || end < start) {
    throw new ContractError({
      code: 'conflict',
      message: 'Selection changed. Select the text again.',
    });
  }
  const chosen = displayed.slice(start, end + 1);
  const track = chosen[0]?.track;
  if (!track || chosen.some((entry) => entry.track !== track)) {
    throw new ContractError({ code: 'conflict', message: 'Select words on one track.' });
  }
  const ids = chosen.flatMap((entry) => entry.token.wordIds);
  const original = t.segments
    .filter((segment) => segment.track === track)
    .flatMap((segment) => segment.words.map((word) => word.id));
  const offset = original.indexOf(ids[0] ?? '');
  if (offset < 0 || original.slice(offset, offset + ids.length).some((id, i) => id !== ids[i])) {
    throw new ContractError({
      code: 'conflict',
      message: 'Selection changed. Select the text again.',
    });
  }
  return ids;
}

function editState(t: TranscriptFile): { canUndo: boolean; canRedo: boolean } {
  return { canUndo: t.undoStack.length > 0, canRedo: t.redoStack.length > 0 };
}

/** Only persisted changes are broadcast; the UI uses the revision to notice missing events. */
function publishEdit(before: TranscriptFile, after: TranscriptFile, emit?: Emit): void {
  if (!emit || before.revision === after.revision) return;
  const oldSegments = toTranscriptPage(before, 0, Number.MAX_SAFE_INTEGER).segments;
  const fresh = toTranscriptPage(after, 0, Number.MAX_SAFE_INTEGER);
  const oldById = new Map(oldSegments.map((segment) => [segment.id, segment]));
  const newIds = new Set(fresh.segments.map((segment) => segment.id));
  emit('transcriptChanged', {
    meetingId: after.meetingId,
    revision: after.revision,
    change: {
      kind: 'replace',
      removedSegmentIds: oldSegments
        .filter((segment) => !newIds.has(segment.id))
        .map((segment) => segment.id),
      segments: fresh.segments.filter(
        (segment) => JSON.stringify(oldById.get(segment.id)) !== JSON.stringify(segment),
      ),
    },
    speakers: fresh.speakers,
  });
}

/** Later edits only flag a summary that exists, so the UI is told about nothing else. */
async function publishOutdated(
  library: Library,
  before: TranscriptFile,
  after: TranscriptFile,
  emit?: Emit,
): Promise<void> {
  if (emit && before.revision !== after.revision && (await library.readSummary(after.meetingId))) {
    emit('summaryOutdated', { meetingId: after.meetingId });
  }
}

async function toTerm(library: Library, entry: VocabularyEntry): Promise<ContractTerm> {
  const snippets = await Promise.all(
    entry.contexts.slice(0, 5).map((context) => library.vocabularyContext(context)),
  );
  return {
    id: entry.id,
    term: entry.term,
    enabled: entry.enabled,
    misheard: entry.misheard,
    contexts: snippets
      .filter((snippet) => snippet !== null)
      .map((snippet) => `${snippet.before} ${entry.term} ${snippet.after}`.trim()),
    history: [
      { at: entry.createdAt, action: 'created' as const, detail: 'Remembered term' },
      ...(entry.updatedAt === entry.createdAt
        ? []
        : [{ at: entry.updatedAt, action: 'edited' as const, detail: 'Last vocabulary update' }]),
    ],
  };
}

type MeetingFacts = MeetingRow | MeetingMeta;

/** Statuses correspond directly to the persisted meeting states. */
function toContractStatus(status: MeetingFacts['status']): MeetingStatus {
  return status;
}

const SAFE_TRANSCRIPTION_FAILURES = new Set([
  MISSING_TOOLS_MESSAGE,
  WORKER_FAILED_MESSAGE,
  NOT_ENABLED_MESSAGE,
]);

function safeTranscriptionFailure(message: string | null | undefined): string {
  return message && SAFE_TRANSCRIPTION_FAILURES.has(message) ? message : WORKER_FAILED_MESSAGE;
}

function hasSavedAudio(library: Library, meeting: MeetingMeta): boolean {
  if (meeting.audioDeletedAt !== null) return false;
  const paths = library.meetingPaths(meeting.id);
  return [paths.audioMicrophone, paths.audioMeeting].some((dir) => {
    try {
      return readdirSync(dir).some((file) => file.endsWith('.opus') || file.endsWith('.opus.part'));
    } catch {
      return false;
    }
  });
}

function toListItem(meeting: MeetingFacts): MeetingListItem {
  return {
    id: meeting.id,
    title: meeting.title,
    startedAt: meeting.date,
    durationMs: meeting.durationMs,
    origin: meeting.source,
    status: toContractStatus(meeting.status),
    summaryState: 'notGenerated',
    speakerCount: 0,
  };
}

/** Reads a meeting's real facts, turning a missing one into the error the contract names. */
async function requireMeeting(library: Library, meetingId: string): Promise<MeetingMeta> {
  try {
    return await library.getMeeting(meetingId);
  } catch (error) {
    if (error instanceof MeetingNotFoundError) {
      throw new ContractError({ code: 'notFound', message: 'That meeting no longer exists.' });
    }
    throw error;
  }
}

function timelineGaps(library: Library, meeting: MeetingMeta): TimelineGap[] {
  try {
    const { audio } = library.meetingPaths(meeting.id);
    return readSealedGaps(audio, meeting.durationMs * NS_PER_MS).map((gap) => ({
      kind: gap.kind,
      track: gap.track,
      startMs: Math.round(gap.startNs / NS_PER_MS),
      endMs: Math.round(gap.endNs / NS_PER_MS),
    }));
  } catch (error) {
    // Damaged gap records must not stop the user opening the meeting and its audio.
    library.logger.log('warn', 'meeting-gaps-unreadable', {
      meetingId: meeting.id,
      ...errorFields(error),
    });
    return [];
  }
}

function toDetail(library: Library, meeting: MeetingMeta): MeetingDetail {
  return {
    ...toListItem(meeting),
    gaps: timelineGaps(library, meeting),
    hasAudio: hasSavedAudio(library, meeting),
    ...(meeting.status === 'transcriptionFailed' && {
      transcriptionFailure: safeTranscriptionFailure(meeting.transcriptionFailure),
    }),
    ...(meeting.status === 'recovered' && { recoveredEndMs: meeting.durationMs }),
  };
}

function toContractSegment(segment: DisplaySegment): TranscriptSegment {
  return {
    id: segment.id,
    speakerId: segment.speakerId,
    track: segment.track,
    startMs: segment.tokens[0]?.startMs ?? 0,
    endMs: segment.tokens.at(-1)?.endMs ?? 0,
    words: segment.tokens.map((token) => ({
      id: token.wordIds[0] ?? '',
      text: token.text,
      startMs: token.startMs,
      endMs: token.endMs,
      state: token.correctionId ? 'corrected' : segment.pass === 'final' ? 'final' : 'provisional',
      correctionId: token.correctionId,
    })),
  };
}

function toContractSpeaker(speaker: Speaker): ContractSpeaker {
  return {
    id: speaker.id,
    label: speaker.name ?? speaker.label,
    kind: speaker.id === YOU_ID ? 'you' : speaker.name ? 'named' : 'unknown',
    profileId: speaker.profileId,
  };
}

function toTranscriptPage(
  transcript: TranscriptFile,
  offset: number,
  limit: number,
): TranscriptPage {
  const display = resolveDisplay(transcript);
  return {
    meetingId: transcript.meetingId,
    revision: transcript.revision,
    totalSegments: display.length,
    totalWords: display.reduce((sum, segment) => sum + segment.tokens.length, 0),
    segments: display.slice(offset, offset + limit).map(toContractSegment),
    speakers: activeSpeakers(transcript).map(toContractSpeaker),
  };
}

/** Real meetings for the Recordings screen. A meeting not in the library is `notFound`. */
export function createMeetingHandlers(
  library: Library,
  emit?: Emit,
  openPath?: (path: string) => Promise<string>,
  finalPasses: FinalPassQueue | null = null,
): CallHandlers {
  const retrying = new Set<string>();
  return {
    listMeetings: async (request) => {
      const { filter = {} } = request as { filter?: MeetingFilter };
      return library
        .listMeetings()
        .map(toListItem)
        .filter((item) => matchesMeetingFilter(item, filter));
    },
    getMeeting: async (request) => {
      const { meetingId } = request as { meetingId: string };
      return toDetail(library, await requireMeeting(library, meetingId));
    },
    retryFinalPass: async (request) => {
      const { meetingId } = request as { meetingId: string };
      const meeting = await requireMeeting(library, meetingId);
      // The status check alone lets a double click queue the pass twice.
      if (
        retrying.has(meetingId) ||
        meeting.status !== 'transcriptionFailed' ||
        !hasSavedAudio(library, meeting)
      ) {
        throw new ContractError({
          code: 'conflict',
          message: 'No failed pass with saved audio can be retried.',
        });
      }
      if (!finalPasses) {
        throw new ContractError({
          code: 'notImplemented',
          message: 'Transcription is not configured.',
        });
      }
      try {
        if (sealedTracks(library.meetingPaths(meetingId).audio).length === 0) {
          throw new Error('No readable sealed tracks');
        }
      } catch {
        throw new ContractError({
          code: 'conflict',
          message: 'This meeting has no readable sealed audio.',
        });
      }
      retrying.add(meetingId);
      try {
        await library.updateMeeting(meetingId, {
          status: 'finalPassRunning',
          transcriptionFailure: null,
        });
        emit?.('meetingChanged', toListItem(await requireMeeting(library, meetingId)));
        finalPasses.enqueue(meetingId);
      } finally {
        retrying.delete(meetingId);
      }
    },
    getTranscript: async (request) => {
      const { meetingId, offset, limit } = request as {
        meetingId: string;
        offset: number;
        limit: number;
      };
      const meeting = await requireMeeting(library, meetingId);
      if (meeting.status === 'transcriptionFailed') {
        throw new ContractError({
          code: 'internal',
          message: safeTranscriptionFailure(meeting.transcriptionFailure),
        });
      }
      return toTranscriptPage(await library.readTranscript(meetingId), offset, limit);
    },
    getUndoState: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      return editState(await library.readTranscript(meetingId));
    },
    applyCorrection: async (request) => {
      const { meetingId, range, text, remember } = request as {
        meetingId: string;
        range: WordRange;
        text: string;
        remember: boolean;
      };
      await requireMeeting(library, meetingId);
      const before = await library.readTranscript(meetingId);
      try {
        const after = await library.applyCorrection(meetingId, {
          wordIds: selectedWordIds(before, range),
          replacement: text,
          remember,
        });
        publishEdit(before, after, emit);
        await publishOutdated(library, before, after, emit);
        return editState(after);
      } catch (error) {
        if (error instanceof CorrectionConflictError) {
          throw new ContractError({
            code: 'conflict',
            message: 'Selection changed. Select the text again.',
          });
        }
        throw error;
      }
    },
    reassignSpeaker: async (request) => {
      const { meetingId, range, speakerId } = request as {
        meetingId: string;
        range: WordRange;
        speakerId: string;
      };
      await requireMeeting(library, meetingId);
      const before = await library.readTranscript(meetingId);
      try {
        const after = await library.reassignSpeaker(
          meetingId,
          selectedWordIds(before, range),
          speakerId,
        );
        publishEdit(before, after, emit);
        await publishOutdated(library, before, after, emit);
        return editState(after);
      } catch (error) {
        if (error instanceof CorrectionConflictError) {
          throw new ContractError({
            code: 'conflict',
            message: 'The selected speaker or text changed.',
          });
        }
        throw error;
      }
    },
    undo: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      const before = await library.readTranscript(meetingId);
      const after = await library.undo(meetingId);
      publishEdit(before, after, emit);
      await publishOutdated(library, before, after, emit);
      return editState(after);
    },
    redo: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      const before = await library.readTranscript(meetingId);
      const after = await library.redo(meetingId);
      publishEdit(before, after, emit);
      await publishOutdated(library, before, after, emit);
      return editState(after);
    },
    listSpeakerSuggestions: async (request) => {
      const { meetingId } = request as { meetingId?: string };
      if (meetingId) await requireMeeting(library, meetingId);
      // No suggestion store exists yet: do not invent a voice match.
      return [];
    },
    getProfileUndoState: async () => library.voiceProfiles.undoState(),
    undoProfileChange: async () => {
      try {
        return library.voiceProfiles.undo();
      } catch (error) {
        if (error instanceof StorageError && error.code === 'PROFILE_CHANGED') {
          throw new ContractError({ code: 'conflict', message: 'Profiles changed since this edit.' });
        }
        throw error;
      }
    },
    redoProfileChange: async () => {
      try {
        return library.voiceProfiles.redo();
      } catch (error) {
        if (error instanceof StorageError && error.code === 'PROFILE_CHANGED') {
          throw new ContractError({ code: 'conflict', message: 'Profiles changed since this edit.' });
        }
        throw error;
      }
    },
    listProfiles: async () => {
      const dates = new Map(library.listMeetings().map((row) => [row.id, row.date]));
      return library.voiceProfiles.list().map((profile) => ({
        id: profile.id,
        name: profile.name,
        meetingCount: profile.meetingIds.length,
        lastHeardAt:
          profile.meetingIds
            .map((id) => dates.get(id))
            .filter((date): date is string => date !== undefined)
            .sort()
            .at(-1) ?? profile.updatedAt,
      }));
    },
    renameSpeaker: async (request) => {
      const { target, name } = request as {
        target:
          | { kind: 'profile'; profileId: string }
          | { kind: 'meetingSpeaker'; meetingId: string; speakerId: string };
        name: string;
      };
      if (target.kind === 'profile') {
        if (!library.voiceProfiles.get(target.profileId)) {
          throw new ContractError({
            code: 'notFound',
            message: 'That voice profile no longer exists.',
          });
        }
        library.voiceProfiles.rename(target.profileId, name);
        return;
      }
      await requireMeeting(library, target.meetingId);
      const before = await library.readTranscript(target.meetingId);
      try {
        const after = await library.renameSpeaker(target.meetingId, target.speakerId, name);
        publishEdit(before, after, emit);
        await publishOutdated(library, before, after, emit);
      } catch (error) {
        if (error instanceof CorrectionConflictError) {
          throw new ContractError({ code: 'conflict', message: 'That speaker no longer exists.' });
        }
        throw error;
      }
    },
    mergeSpeakers: async (request) => {
      const merge = request as
        | { kind: 'profiles'; from: string; into: string }
        | { kind: 'meetingSpeakers'; meetingId: string; from: string; into: string };
      if (merge.kind === 'profiles') {
        const first = library.voiceProfiles.get(merge.from);
        const second = library.voiceProfiles.get(merge.into);
        if (!first || !second) {
          throw new ContractError({
            code: 'notFound',
            message: 'A voice profile no longer exists.',
          });
        }
        if (first.modelId !== second.modelId || merge.from === merge.into) {
          throw new ContractError({
            code: 'conflict',
            message: 'Those profiles cannot be merged.',
          });
        }
        library.voiceProfiles.merge(merge.from, merge.into);
        return;
      }
      await requireMeeting(library, merge.meetingId);
      const before = await library.readTranscript(merge.meetingId);
      try {
        const after = await library.mergeSpeakers(merge.meetingId, merge.from, merge.into);
        publishEdit(before, after, emit);
        await publishOutdated(library, before, after, emit);
      } catch (error) {
        if (error instanceof CorrectionConflictError) {
          throw new ContractError({
            code: 'conflict',
            message: 'Those speakers cannot be merged.',
          });
        }
        throw error;
      }
    },
    deleteProfile: async (request) => {
      const { profileId } = request as { profileId: string };
      if (!library.voiceProfiles.get(profileId)) {
        throw new ContractError({
          code: 'notFound',
          message: 'That voice profile no longer exists.',
        });
      }
      try {
        const changes = await library.deleteVoiceProfile(profileId);
        for (const { before, after } of changes) {
          publishEdit(before, after, emit);
        }
      } catch (error) {
        if (error instanceof StorageError && error.code === 'PROFILE_BUSY') {
          throw new ContractError({ code: 'conflict', message: error.message });
        }
        throw error;
      }
    },
    getVocabularyUndoState: async () => library.vocabulary.undoState(),
    undoVocabulary: async () => {
      try {
        return library.vocabulary.undo();
      } catch (error) {
        if (error instanceof StorageError && error.code === 'VOCABULARY_CHANGED') {
          throw new ContractError({
            code: 'conflict',
            message: 'Vocabulary changed since this edit.',
          });
        }
        throw error;
      }
    },
    redoVocabulary: async () => {
      try {
        return library.vocabulary.redo();
      } catch (error) {
        if (error instanceof StorageError && error.code === 'VOCABULARY_CHANGED') {
          throw new ContractError({
            code: 'conflict',
            message: 'Vocabulary changed since this edit.',
          });
        }
        throw error;
      }
    },
    listTerms: async () =>
      Promise.all(library.vocabulary.list().map((entry) => toTerm(library, entry))),
    updateTerm: async (request) => {
      const { id, patch } = request as { id: string; patch: VocabularyTermPatch };
      if (!library.vocabulary.get(id)) {
        throw new ContractError({ code: 'notFound', message: 'That term no longer exists.' });
      }
      try {
        library.vocabulary.update(id, patch);
      } catch (error) {
        if (/UNIQUE constraint/.test(String(error))) {
          throw new ContractError({ code: 'conflict', message: 'That term is already listed.' });
        }
        throw error;
      }
      return toTerm(library, library.vocabulary.get(id)!);
    },
    deleteTerm: async (request) => {
      const { id } = request as { id: string };
      if (!library.vocabulary.get(id)) {
        throw new ContractError({ code: 'notFound', message: 'That term no longer exists.' });
      }
      library.vocabulary.delete(id);
    },
    searchMeetings: async (request) => {
      const { query, filter } = request as { query: string; filter?: MeetingFilter };
      // Storage UTC-date prefiltering would discard meetings on a local midnight boundary.
      const found = await library.search(query, { hitsPerMeeting: 5 });
      return found.results
        .filter((result) => matchesMeetingFilter(toListItem(result.meeting), filter))
        .map((result) => ({
        meeting: toListItem(result.meeting),
        matches: [
          ...(result.matchedIn.includes('title or date')
            ? [{ segmentId: null, startMs: null, snippet: null }]
            : []),
          ...result.hits.map((hit) => ({
            segmentId: hit.segmentId,
            startMs: hit.startMs,
            snippet: hit.snippet,
          })),
        ],
      }));
    },
    openMeetingFolder: async (request) => {
      const { meetingId, folder } = request as {
        meetingId: string;
        folder: 'meeting' | 'audio' | 'exports';
      };
      await requireMeeting(library, meetingId);
      if (!openPath)
        throw new ContractError({
          code: 'notImplemented',
          message: 'Open folder is unavailable in this build.',
        });
      const paths = library.meetingPaths(meetingId);
      const requested =
        folder === 'meeting' ? paths.folder : folder === 'audio' ? paths.audio : paths.exports;
      const root = await realpath(library.paths.root);
      const actual = await realpath(requested).catch(() => {
        throw new ContractError({ code: 'notFound', message: 'That meeting folder is missing.' });
      });
      if (!actual.startsWith(root + sep)) {
        throw new ContractError({
          code: 'permissionDenied',
          message: 'Folder access was refused.',
        });
      }
      const failure = await openPath(actual);
      if (failure)
        throw new ContractError({
          code: 'internal',
          message: 'The file manager could not open that folder.',
        });
    },
    openLogsFolder: async () => {
      if (!openPath)
        throw new ContractError({
          code: 'notImplemented',
          message: 'Open folder is unavailable in this build.',
        });
      const actual = await realpath(library.paths.logs);
      const root = await realpath(library.paths.root);
      if (!actual.startsWith(root + sep)) {
        throw new ContractError({
          code: 'permissionDenied',
          message: 'Folder access was refused.',
        });
      }
      const failure = await openPath(actual);
      if (failure)
        throw new ContractError({
          code: 'internal',
          message: 'The file manager could not open the logs.',
        });
    },
    getSummary: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      return toSummaryDoc(meetingId, await library.readSummary(meetingId));
    },
    updateSummaryItem: async (request) => {
      const { meetingId, update } = request as {
        meetingId: string;
        update: SummaryItemUpdate;
      };
      await requireMeeting(library, meetingId);
      try {
        const doc = await library.updateSummary(meetingId, (current) =>
          applySummaryUpdate(current, update),
        );
        return toSummaryDoc(meetingId, doc);
      } catch (error) {
        if (error instanceof StorageError && error.code === 'NO_SUMMARY') {
          throw new ContractError({
            code: 'notFound',
            message: 'Generate a summary before editing.',
          });
        }
        throw error;
      }
    },
    deleteMeeting: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      try {
        const result = await library.deleteMeeting(meetingId);
        const cache = meetingCachePath(library.paths, meetingId);
        const prefix = `${library.paths.index}.upgrade-`;
        const names = result.remaining.map((left) =>
          left === cache
            ? 'Temporary files'
            : left.startsWith(prefix)
              ? 'Index recovery copy'
              : 'Meeting files',
        );
        return { verified: result.ok, remaining: [...new Set(names)] };
      } catch (error) {
        if (error instanceof StorageError && error.code === 'ACTIVE_MEETING') {
          throw new ContractError({ code: 'conflict', message: error.message });
        }
        throw error;
      }
    },
  };
}
