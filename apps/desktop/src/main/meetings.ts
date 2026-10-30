import { readSealedGaps } from '@scrb/app-core';
import {
  ContractError,
  type MeetingDetail,
  type MeetingFilter,
  type MeetingListItem,
  type MeetingSummaryDoc,
  type TimelineGap,
  type TranscriptPage,
} from '@scrb/contracts';
import {
  errorFields,
  MeetingNotFoundError,
  type Library,
  type MeetingMeta,
  type MeetingRow,
} from '@scrb/storage';
import type { CallHandlers } from './dispatch.ts';

const NS_PER_MS = 1e6;

type MeetingFacts = MeetingRow | MeetingMeta;

function toListItem(meeting: MeetingFacts): MeetingListItem {
  return {
    id: meeting.id,
    title: meeting.title,
    startedAt: meeting.date,
    durationMs: meeting.durationMs,
    origin: meeting.source,
    status: meeting.status,
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

function emptyTranscriptPage(meetingId: string): TranscriptPage {
  return { meetingId, revision: 0, totalSegments: 0, totalWords: 0, segments: [], speakers: [] };
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
export function createMeetingHandlers(library: Library): CallHandlers {
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
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      return emptyTranscriptPage(meetingId);
    },
    getSummary: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      return emptySummary(meetingId);
    },
    deleteMeeting: async (request) => {
      const { meetingId } = request as { meetingId: string };
      await requireMeeting(library, meetingId);
      throw new ContractError({
        code: 'notImplemented',
        message: 'Deleting a recorded meeting is not available yet.',
      });
    },
  };
}
