import {
  ContractError,
  type AppSettings,
  type Backend,
  type BackendCalls,
  type BackendEvents,
  type CallName,
  type DeleteResult,
  type EventName,
  type MeetingDetail,
  type MeetingListItem,
  type MeetingSummaryDoc,
  type RecordingHealth,
  type RecordingState,
  type SettingsPatch,
  type TranscriptSegment,
  type TranscriptionLag,
  type VocabularyTerm,
  type VoiceProfile,
} from '@scrb/contracts';
import {
  APP_INFO,
  DEFAULT_SETTINGS,
  INPUT_DEVICES,
  LICENSES,
  LONG_MEETING_ID,
  MEETING_APPS,
  MODELS,
  MODEL_UPDATES,
  VOCABULARY_TERMS,
  VOICE_PROFILES,
  createLibrary,
  createSummary,
} from './fixtures.ts';
import { createPrng } from './prng.ts';
import { SCRIPT, type ScriptStep } from './scripted-meeting.ts';
import { MOCK_SPEAKERS, generateSegment, generateTranscript } from './transcript.ts';
import { readStored, writeStored } from '../lib/stored-value.ts';

const SETTINGS_KEY = 'scrb.mock.settings';
const LONG_MEETING_WORDS = 80_000;
const SHORT_MEETING_WORDS = 2_000;
const FULL_DISK_BYTES = 180_000_000_000;

/** Armed faults change what the next matching call does; see `dev-triggers.ts`. */
export type ArmedFault =
  | 'deleteFails'
  | 'exportFails'
  | 'importFails'
  | 'summaryFails'
  | 'modelDownloadFails'
  | 'permissionDenied'
  | 'noModelInfo'
  | 'modelsMissing';

type Handlers = {
  [K in CallName]: (
    request: BackendCalls[K]['request'],
  ) => BackendCalls[K]['response'] | Promise<BackendCalls[K]['response']>;
};
type Listener = (payload: never) => void;

function mergeSettings(settings: AppSettings, patch: SettingsPatch): AppSettings {
  return {
    ...settings,
    ...patch,
    audio: { ...settings.audio, ...patch.audio },
    autoDelete: { ...settings.autoDelete, ...patch.autoDelete },
    location: { ...settings.location, ...patch.location },
  };
}

function toListItem(meeting: MeetingDetail): MeetingListItem {
  return {
    id: meeting.id,
    title: meeting.title,
    startedAt: meeting.startedAt,
    durationMs: meeting.durationMs,
    origin: meeting.origin,
    status: meeting.status,
    summaryState: meeting.summaryState,
    speakerCount: meeting.speakerCount,
  };
}

export class MockBackend implements Backend {
  private readonly listeners = new Map<EventName, Set<Listener>>();
  private readonly armed = new Set<ArmedFault>();
  private readonly prng = createPrng(20261030);
  private readonly transcripts = new Map<string, TranscriptSegment[]>();
  private readonly summaries = new Map<string, MeetingSummaryDoc>();
  private readonly undoDepth = new Map<string, { undo: number; redo: number }>();
  private settings: AppSettings = mergeSettings(
    DEFAULT_SETTINGS,
    readStored<SettingsPatch>(SETTINGS_KEY) ?? {},
  );
  private library: MeetingDetail[] = createLibrary();
  private profiles: VoiceProfile[] = VOICE_PROFILES.map((profile) => ({ ...profile }));
  private terms: VocabularyTerm[] = VOCABULARY_TERMS.map((term) => ({ ...term }));
  private recording: RecordingState = {
    status: 'idle',
    meetingId: null,
    elapsedMs: 0,
    privacyBannerRequired: false,
  };
  private ticker: ReturnType<typeof setInterval> | undefined;
  private second = 0;
  private revision = 0;
  private liveStartMs = 0;
  private nextId = 1;

  call = (async (name: CallName, request?: unknown) => {
    const handler = this.handlers[name] as (request: unknown) => unknown;
    return handler(request);
  }) as Backend['call'];

  on: Backend['on'] = (name, listener) => {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    this.listeners.set(name, set);
    set.add(listener as Listener);
    return () => set.delete(listener as Listener);
  };

  emit<K extends EventName>(name: K, payload: BackendEvents[K]): void {
    this.listeners
      .get(name)
      ?.forEach((listener) => (listener as (value: unknown) => void)(payload));
  }

  /** Makes the next matching calls fail or return their degraded state. */
  arm(fault: ArmedFault): void {
    this.armed.add(fault);
  }

  isArmed(fault: ArmedFault): boolean {
    return this.armed.has(fault);
  }

  setLibrary(meetings: MeetingDetail[]): void {
    this.library = meetings;
  }

  /** Replaces the library with its full sample state, clearing armed faults. */
  reset(): void {
    this.armed.clear();
    this.library = createLibrary();
    this.summaries.clear();
  }

  updateMeetingStatus(meetingId: string, patch: Partial<MeetingDetail>): void {
    this.library = this.library.map((meeting) =>
      meeting.id === meetingId ? { ...meeting, ...patch } : meeting,
    );
  }

  dispose(): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
  }

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private findMeeting(meetingId: string): MeetingDetail {
    const meeting = this.library.find((item) => item.id === meetingId);
    if (!meeting)
      throw new ContractError({ code: 'notFound', message: 'That meeting no longer exists.' });
    return meeting;
  }

  private transcriptOf(meetingId: string): TranscriptSegment[] {
    let segments = this.transcripts.get(meetingId);
    if (!segments) {
      const words = meetingId === LONG_MEETING_ID ? LONG_MEETING_WORDS : SHORT_MEETING_WORDS;
      segments = generateTranscript(meetingId, words, meetingId.length * 7919).segments;
      this.transcripts.set(meetingId, segments);
    }
    return segments;
  }

  private summaryOf(meetingId: string): MeetingSummaryDoc {
    const meeting = this.findMeeting(meetingId);
    let summary = this.summaries.get(meetingId);
    if (!summary) {
      summary = createSummary(meetingId, meeting.summaryState);
      this.summaries.set(meetingId, summary);
    }
    return summary;
  }

  private setRecording(patch: Partial<RecordingState>): void {
    this.recording = { ...this.recording, ...patch };
    this.emit('recordingStateChanged', this.recording);
  }

  private tick(): void {
    this.second += 1;
    const step = SCRIPT.find((entry) => entry.atSecond === this.second)?.step;
    if (step) this.runStep(step);
    if (this.recording.status !== 'recording') return;
    this.recording = { ...this.recording, elapsedMs: this.recording.elapsedMs + 1000 };
    this.emit('recordingStateChanged', this.recording);
    this.emit('levelMeter', {
      micDb: -60 + this.prng.int(0, 40),
      meetingDb: -55 + this.prng.int(0, 35),
    });
    this.appendLiveSegment();
  }

  private appendLiveSegment(): void {
    const meetingId = this.recording.meetingId as string;
    const segments = this.transcripts.get(meetingId) ?? [];
    const segment = generateSegment({
      meetingId,
      index: segments.length,
      startMs: this.liveStartMs,
      state: 'provisional',
      prng: this.prng,
    });
    segments.push(segment);
    this.transcripts.set(meetingId, segments);
    this.liveStartMs = segment.endMs;
    this.revision += 1;
    this.emit('transcriptChanged', {
      meetingId,
      revision: this.revision,
      change: { kind: 'append', segments: [segment] },
      speakers: [],
    });
  }

  private runStep(step: ScriptStep): void {
    switch (step.kind) {
      case 'pause':
        this.setRecording({ status: 'paused' });
        break;
      case 'resume':
        this.setRecording({ status: 'recording' });
        break;
      case 'deviceChange':
        this.emit('deviceChanged', {
          kind: 'added',
          device: INPUT_DEVICES[1] as (typeof INPUT_DEVICES)[number],
          suggestSwitch: true,
        });
        break;
      case 'lagSpike':
        this.emit('transcriptionLag', { status: 'lagging', lagMs: step.lagMs });
        break;
      case 'lagClear':
        this.emit('transcriptionLag', { status: 'ok', lagMs: 1200 });
        break;
    }
  }

  private readonly handlers: Handlers = {
    startRecording: ({ title }) => {
      if (this.recording.status !== 'idle') {
        throw new ContractError({ code: 'conflict', message: 'A recording is already running.' });
      }
      const meetingId = this.id('meeting-live');
      this.library = [
        {
          id: meetingId,
          title: title ?? 'Scripted live meeting',
          startedAt: new Date().toISOString(),
          durationMs: 0,
          origin: 'recorded',
          status: 'recording',
          summaryState: 'notGenerated',
          speakerCount: MOCK_SPEAKERS.length,
          gaps: [],
        },
        ...this.library,
      ];
      this.second = 0;
      this.liveStartMs = 0;
      this.setRecording({
        status: 'recording',
        meetingId,
        elapsedMs: 0,
        privacyBannerRequired: this.settings.location.usState === 'IL',
      });
      const health: RecordingHealth = { level: 'ok', warnings: [], diskFreeBytes: FULL_DISK_BYTES };
      this.emit('recordingHealth', health);
      const lag: TranscriptionLag = { status: 'ok', lagMs: 1200 };
      this.emit('transcriptionLag', lag);
      this.ticker = setInterval(() => this.tick(), 1000);
      return { meetingId };
    },
    pauseRecording: () => this.setRecording({ status: 'paused' }),
    resumeRecording: () => this.setRecording({ status: 'recording' }),
    stopRecording: () => {
      this.dispose();
      const meetingId = this.recording.meetingId;
      if (meetingId) {
        this.updateMeetingStatus(meetingId, {
          status: 'finalPassRunning',
          durationMs: this.recording.elapsedMs,
        });
      }
      this.setRecording({
        status: 'idle',
        meetingId: null,
        elapsedMs: 0,
        privacyBannerRequired: false,
      });
      this.emit('transcriptionLag', { status: 'off', lagMs: 0 });
    },
    getRecordingState: () => this.recording,

    pickAudioFile: () => ({
      fileToken: this.id('file'),
      fileName: 'Client interview.m4a',
      sizeBytes: 42_000_000,
      fileDate: '2026-10-21T15:00:00Z',
    }),
    importAudioFile: ({ fileToken }) => {
      const importId = this.id('import');
      const fileName = 'Client interview.m4a';
      if (this.armed.delete('importFails')) {
        const failure = {
          importId,
          fileName,
          reason: 'unreadable',
          message: 'This file could not be read. It may be damaged or not an audio file.',
        } as const;
        setTimeout(() => this.emit('importFailed', failure), 300);
        return { importId };
      }
      void fileToken;
      this.emit('importProgress', { importId, fileName, stage: 'decoding', fraction: 0.1 });
      setTimeout(() => {
        const meetingId = this.id('meeting-import');
        this.library = [
          {
            id: meetingId,
            title: fileName,
            startedAt: '2026-10-21T15:00:00Z',
            durationMs: 26 * 60_000,
            origin: 'imported',
            status: 'ready',
            summaryState: 'notGenerated',
            speakerCount: 2,
            gaps: [],
          },
          ...this.library,
        ];
        this.emit('importFinished', { importId, meetingId });
      }, 1500);
      return { importId };
    },
    cancelImport: () => undefined,

    listInputDevices: () => INPUT_DEVICES,
    listMeetingApps: () => MEETING_APPS,
    selectSources: (selection) => {
      this.settings = mergeSettings(this.settings, { audio: selection });
    },

    getTranscript: ({ meetingId, offset, limit }) => {
      const all = this.transcriptOf(meetingId);
      return {
        meetingId,
        revision: this.revision,
        totalSegments: all.length,
        totalWords: all.reduce((sum, segment) => sum + segment.words.length, 0),
        segments: all.slice(offset, offset + limit),
        speakers: MOCK_SPEAKERS,
      };
    },
    applyCorrection: ({ meetingId }) => this.pushUndo(meetingId),
    reassignSpeaker: ({ meetingId }) => this.pushUndo(meetingId),
    undo: ({ meetingId }) => this.moveUndo(meetingId, -1),
    redo: ({ meetingId }) => this.moveUndo(meetingId, 1),
    seekAudio: ({ meetingId, positionMs }) => {
      this.emit('playbackPosition', { meetingId, positionMs, isPlaying: true });
    },
    pauseAudio: ({ meetingId }) => {
      this.emit('playbackPosition', { meetingId, positionMs: 0, isPlaying: false });
    },

    listProfiles: () => this.profiles,
    renameSpeaker: ({ target, name }) => {
      if (target.kind === 'profile') {
        this.profiles = this.profiles.map((profile) =>
          profile.id === target.profileId ? { ...profile, name } : profile,
        );
      }
    },
    mergeSpeakers: (merge) => {
      if (merge.kind === 'profiles') {
        this.profiles = this.profiles.filter((profile) => profile.id !== merge.from);
      }
    },
    splitSpeaker: () => ({ speakerId: this.id('sp') }),
    deleteProfile: ({ profileId }) => {
      this.profiles = this.profiles.filter((profile) => profile.id !== profileId);
    },
    answerSpeakerSuggestion: () => undefined,

    listTerms: () => this.terms,
    updateTerm: ({ id, patch }) => {
      const term = this.terms.find((item) => item.id === id);
      if (!term)
        throw new ContractError({ code: 'notFound', message: 'That term no longer exists.' });
      const updated = { ...term, ...patch };
      this.terms = this.terms.map((item) => (item.id === id ? updated : item));
      return updated;
    },
    deleteTerm: ({ id }) => {
      this.terms = this.terms.filter((term) => term.id !== id);
    },

    getSummary: ({ meetingId }) => this.summaryOf(meetingId),
    generateSummary: ({ meetingId }) => {
      this.findMeeting(meetingId);
      if (this.armed.delete('summaryFails')) {
        const message = 'The summary could not be generated. Try again.';
        this.emit('summaryProgress', { meetingId, stage: 'failed', fraction: 0, message });
        return;
      }
      this.updateMeetingStatus(meetingId, { summaryState: 'generating' });
      this.emit('summaryProgress', { meetingId, stage: 'extracting', fraction: 0.2 });
      setTimeout(() => {
        this.updateMeetingStatus(meetingId, { summaryState: 'ready' });
        this.summaries.set(meetingId, createSummary(meetingId, 'ready'));
        this.emit('summaryProgress', { meetingId, stage: 'done', fraction: 1 });
      }, 1200);
    },
    updateSummaryItem: ({ meetingId }) => {
      const updated = { ...this.summaryOf(meetingId), state: 'edited' as const };
      this.summaries.set(meetingId, updated);
      return updated;
    },

    listMeetings: ({ filter }) =>
      this.library
        .filter((meeting) => !filter?.origin || meeting.origin === filter.origin)
        .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map(toListItem),
    getMeeting: ({ meetingId }) => this.findMeeting(meetingId),
    updateMeeting: ({ meetingId, ...patch }) => {
      this.updateMeetingStatus(meetingId, patch);
      return this.findMeeting(meetingId);
    },
    searchMeetings: ({ query }) => {
      const needle = query.toLowerCase();
      return this.library
        .filter((meeting) => meeting.title.toLowerCase().includes(needle))
        .map((meeting) => ({
          meeting: toListItem(meeting),
          matches: [{ segmentId: null, startMs: null, snippet: null }],
        }));
    },
    deleteMeeting: ({ meetingId }): DeleteResult => {
      this.findMeeting(meetingId);
      if (this.armed.delete('deleteFails')) {
        return { verified: false, remaining: ['Audio folder'] };
      }
      this.library = this.library.filter((meeting) => meeting.id !== meetingId);
      this.transcripts.delete(meetingId);
      this.summaries.delete(meetingId);
      return { verified: true, remaining: [] };
    },
    openMeetingFolder: () => undefined,
    exportMeeting: ({ meetingId, format }) => {
      const exportId = this.id('export');
      const ok = !this.armed.delete('exportFails');
      setTimeout(() => {
        this.emit(
          'exportFinished',
          ok
            ? { exportId, meetingId, ok, fileName: `Meeting export.${format}` }
            : { exportId, meetingId, ok, message: 'The export could not be saved.' },
        );
      }, 400);
      return { exportId };
    },

    getSettings: () => this.settings,
    updateSettings: (patch) => {
      this.settings = mergeSettings(this.settings, patch);
      writeStored(SETTINGS_KEY, this.settings);
      return this.settings;
    },
    pickStorageLocation: () => this.settings,
    checkModelUpdates: () => MODEL_UPDATES,
    installModelUpdate: () => undefined,
    revertModel: () => undefined,

    getSetupStatus: () => {
      const missing = this.armed.has('modelsMissing');
      const denied = this.armed.has('permissionDenied');
      return {
        models: MODELS.map((model) => ({ ...model, installed: !missing })),
        permissions: { microphone: denied ? 'denied' : 'granted', meetingAudio: 'granted' },
        locationSet: this.settings.location.country !== null,
        complete: !missing && !denied,
      };
    },
    startModelDownload: () => {
      const fails = this.armed.delete('modelDownloadFails');
      this.emit('modelDownloadProgress', {
        role: 'summary',
        modelName: 'summary 8B (4-bit)',
        state: fails ? 'failed' : 'downloading',
        bytesDone: 1_200_000_000,
        bytesTotal: 5_000_000_000,
        ...(fails ? { message: 'The download stopped. Check your connection and retry.' } : {}),
      });
    },
    requestPermission: ({ permission }) => {
      void permission;
      return this.armed.has('permissionDenied') ? 'denied' : 'granted';
    },

    getAppInfo: () => (this.armed.has('noModelInfo') ? { ...APP_INFO, models: [] } : APP_INFO),
    getLicenses: () => LICENSES,
    openLogsFolder: () => undefined,
  };

  private undoStateOf(meetingId: string) {
    const depth = this.undoDepth.get(meetingId) ?? { undo: 0, redo: 0 };
    return { canUndo: depth.undo > 0, canRedo: depth.redo > 0 };
  }

  private pushUndo(meetingId: string) {
    const depth = this.undoDepth.get(meetingId) ?? { undo: 0, redo: 0 };
    this.undoDepth.set(meetingId, { undo: depth.undo + 1, redo: 0 });
    return this.undoStateOf(meetingId);
  }

  private moveUndo(meetingId: string, direction: 1 | -1) {
    const depth = this.undoDepth.get(meetingId) ?? { undo: 0, redo: 0 };
    const available = direction === -1 ? depth.undo : depth.redo;
    if (available > 0) {
      this.undoDepth.set(meetingId, { undo: depth.undo + direction, redo: depth.redo - direction });
    }
    return this.undoStateOf(meetingId);
  }
}
