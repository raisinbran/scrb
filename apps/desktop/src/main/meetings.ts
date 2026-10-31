import { readSealedGaps, WORKER_FAILED_MESSAGE, YOU_ID } from '@scrb/app-core';
import {
  ContractError,
  type BackendEvents,
  type EventName,
  type WordRange,
  type MeetingDetail,
  type MeetingFilter,
  type MeetingListItem,
  type MeetingStatus,
  type MeetingSummaryDoc,
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
    throw new ContractError({ code: 'conflict', message: 'Selection changed. Select the text again.' });
  }
  const chosen = displayed.slice(start, end + 1);
  const track = chosen[0]?.track;
  if (!track || chosen.some((entry) => entry.track !== track)) {
    throw new ContractError({ code: 'conflict', message: 'Select words on one track.' });
  }
  const ids = chosen.flatMap((entry) => entry.token.wordIds);
  const original = t.segments.filter((segment) => segment.track === track)
    .flatMap((segment) => segment.words.map((word) => word.id));
  const offset = original.indexOf(ids[0] ?? '');
  if (offset < 0 || original.slice(offset, offset + ids.length).some((id, i) => id !== ids[i])) {
    throw new ContractError({ code: 'conflict', message: 'Selection changed. Select the text again.' });
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
      removedSegmentIds: oldSegments.filter((segment) => !newIds.has(segment.id))
        .map((segment) => segment.id),
      segments: fresh.segments.filter((segment) =>
        JSON.stringify(oldById.get(segment.id)) !== JSON.stringify(segment)),
    },
    speakers: fresh.speakers,
  });
}


type MeetingFacts = MeetingRow | MeetingMeta;

/** The contract has no failed status, so `getTranscript` is where a failure shows. */
function toContractStatus(status: MeetingFacts['status']): MeetingStatus {
  return status === 'transcriptionFailed' ? 'ready' : status;
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

function matchesFilter(item: MeetingListItem, { origin, from, to }: MeetingFilter): boolean {
  const day = item.startedAt.slice(0, 10);
  return (
    (!origin || item.origin === origin) &&
    (!from || day >= from.slice(0, 10)) &&
    (!to || day <= to.slice(0, 10))
  );
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
      state: token.correctionId
        ? 'corrected'
        : segment.pass === 'final'
          ? 'final'
          : 'provisional',
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

function emptySummary(meetingId: string): MeetingSummaryDoc {
  return {
    meetingId,
    state: 'notGenerated',
    generatedAt: null,
    narrative: { brief: null, full: null },
    actionItems: [],
    decisions: [],
    openQuestions: [],
    warnings: [],
  };
}

/** Real meetings for the Recordings screen. A meeting not in the library is `notFound`. */
export function createMeetingHandlers(library: Library, emit?: Emit): CallHandlers {
  return {
    listMeetings: async (request) => {
      const { filter = {} } = request as { filter?: MeetingFilter };
      return library
        .listMeetings()
        .map(toListItem)
        .filter((item) => matchesFilter(item, filter));
    },
    getMeeting: async (request) => {
      const { meetingId } = request as { meetingId: string };
      return toDetail(library, await requireMeeting(library, meetingId));
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
          message: meeting.transcriptionFailure ?? WORKER_FAILED_MESSAGE,
        });
      }
      return toTranscriptPage(await library.readTranscript(meetingId), offset, limit);
    },
    applyCorrection: async (request) => {
      const { meetingId, range, text, remember } = request as {
        meetingId: string; range: WordRange; text: string; remember: boolean;
      };
      await requireMeeting(library, meetingId);
      const before = await library.readTranscript(meetingId);
      try {
        const after = await library.applyCorrection(meetingId, {
          wordIds: selectedWordIds(before, range), replacement: text, remember,
        });
        publishEdit(before, after, emit);
        if (before.revision !== after.revision && (await library.readSummary(meetingId))) {
          emit?.('summaryOutdated', { meetingId });
        }
        return editState(after);
      } catch (error) {
        if (error instanceof CorrectionConflictError) {
          throw new ContractError({ code: 'conflict', message: 'Selection changed. Select the text again.' });
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
      return editState(after);
    },
    redo: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      const before = await library.readTranscript(meetingId);
      const after = await library.redo(meetingId);
      publishEdit(before, after, emit);
      return editState(after);
    },
    getSummary: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      return emptySummary(meetingId);
    },
    deleteMeeting: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      try {
        const result = await library.deleteMeeting(meetingId);
        return { verified: result.ok, remaining: result.remaining };
      } catch (error) {
        if (error instanceof StorageError && error.code === 'ACTIVE_MEETING') {
          throw new ContractError({ code: 'conflict', message: error.message });
        }
        throw error;
      }
    },
  };
}
