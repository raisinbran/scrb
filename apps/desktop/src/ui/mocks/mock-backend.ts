import {
  ContractError,
  isValidRequest,
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
  type WordRange,
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
import {
  correctWordRange,
  finalizeProvisionalWords,
  reassignWordRange,
  type TranscriptEdit,
} from './corrections.ts';
import { createPrng } from './prng.ts';
import { SCRIPT, type ScriptStep } from './scripted-meeting.ts';
import { MOCK_SPEAKERS, generateSegment, generateTranscript } from './transcript.ts';
import { readStored, writeStored } from '../lib/stored-value.ts';

const SETTINGS_KEY = 'scrb.mock.settings';
const LONG_MEETING_WORDS = 80_000;
const SHORT_MEETING_WORDS = 2_000;
const FULL_DISK_BYTES = 180_000_000_000;
const METER_INTERVAL_MS = 120;
const PLAYBACK_INTERVAL_MS = 500;
/** How many of the newest live segments stay provisional before the live pass confirms them. */
const PROVISIONAL_SEGMENTS = 4;

/** Armed faults change what the next matching call does; see `dev-triggers.ts`. */
export type ArmedFault =
  | 'deleteFails'
  | 'exportFails'
  | 'importFails'
  | 'summaryFails'
  | 'modelDownloadFails'
  | 'permissionDenied'
  | 'noModelInfo'
  | 'modelsMissing'
  | 'startDenied';

type Handlers = {
  [K in CallName]: (
    request: BackendCalls[K]['request'],
  ) => BackendCalls[K]['response'] | Promise<BackendCalls[K]['response']>;
};
type Listener = (payload: never) => void;
type Timer = ReturnType<typeof setTimeout>;

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
  private readonly history = new Map<string, { undo: TranscriptEdit[]; redo: TranscriptEdit[] }>();
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
  private meterTicker: ReturnType<typeof setInterval> | undefined;
  private playbackTicker: ReturnType<typeof setInterval> | undefined;
  private readonly meterPrng = createPrng(20261031);
  private second = 0;
  private readonly revisions = new Map<string, number>();
  private readonly activeImports = new Map<string, { fileName: string; timer: Timer }>();
  private readonly endedImports = new Set<string>();
  private health: RecordingHealth | null = null;
  private lag: TranscriptionLag | null = null;
  private liveStartMs = 0;
  private nextId = 1;

  call = (async (name: CallName, request?: unknown) => {
    if (!isValidRequest(name, request)) {
      throw new ContractError({ code: 'invalidRequest', message: 'That request is not valid.' });
    }
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
    if (name === 'recordingHealth') this.health = payload as RecordingHealth;
    if (name === 'transcriptionLag') this.lag = payload as TranscriptionLag;
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
    clearInterval(this.meterTicker);
    clearInterval(this.playbackTicker);
    this.ticker = undefined;
    this.meterTicker = undefined;
    this.playbackTicker = undefined;
  }

  /** Starts a live meeting that already holds 8 hours of text, for performance checks. */
  startLongLiveMeeting(): void {
    if (this.recording.status !== 'idle') void this.handlers.stopRecording();
    const { meetingId } = this.handlers.startRecording({ title: '8-hour live meeting' }) as {
      meetingId: string;
    };
    const { segments, durationMs } = generateTranscript(meetingId, LONG_MEETING_WORDS, 8);
    this.transcripts.set(meetingId, segments);
    this.liveStartMs = durationMs;
    this.setRecording({ elapsedMs: durationMs });
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

  private revisionOf(meetingId: string): number {
    return this.revisions.get(meetingId) ?? 0;
  }

  /** Runs one import's last step, unless the import was cancelled first. */
  private finishImportLater(importId: string, fileName: string, delayMs: number, end: () => void) {
    const timer = setTimeout(() => {
      this.activeImports.delete(importId);
      this.endedImports.add(importId);
      end();
    }, delayMs);
    this.activeImports.set(importId, { fileName, timer });
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
    this.appendLiveSegment();
    this.confirmOlderSegments();
  }

  private emitLevels(): void {
    if (this.recording.status !== 'recording') return;
    this.emit('levelMeter', {
      micDb: -60 + this.meterPrng.int(0, 40),
      meetingDb: -55 + this.meterPrng.int(0, 35),
    });
  }

  private publishTranscriptChange(
    meetingId: string,
    change: BackendEvents['transcriptChanged']['change'],
  ): void {
    const revision = this.revisionOf(meetingId) + 1;
    this.revisions.set(meetingId, revision);
    this.emit('transcriptChanged', { meetingId, revision, change, speakers: [] });
  }

  private confirmOlderSegments(): void {
    const meetingId = this.recording.meetingId as string;
    const segments = this.transcripts.get(meetingId) ?? [];
    const index = segments.length - 1 - PROVISIONAL_SEGMENTS;
    const confirmed = index >= 0 ? finalizeProvisionalWords(segments[index]) : null;
    if (!confirmed) return;
    segments[index] = confirmed;
    this.publishTranscriptChange(meetingId, {
      kind: 'replace',
      segments: [confirmed],
      removedSegmentIds: [],
    });
  }

  /** Moves through the audio from `positionMs` until something stops it. */
  private playFrom(meetingId: string, positionMs: number): void {
    clearInterval(this.playbackTicker);
    let position = positionMs;
    this.emit('playbackPosition', { meetingId, positionMs: position, isPlaying: true });
    this.playbackTicker = setInterval(() => {
      position += PLAYBACK_INTERVAL_MS;
      this.emit('playbackPosition', { meetingId, positionMs: position, isPlaying: true });
    }, PLAYBACK_INTERVAL_MS);
  }

  private correct(meetingId: string, range: WordRange, text: string, remember: boolean) {
    const segments = this.transcriptOf(meetingId);
    const edit = correctWordRange(segments, range, text, this.id('correction'));
    if (!edit) {
      throw new ContractError({ code: 'notFound', message: 'That text is no longer available.' });
    }
    if (remember) this.rememberTerm(text, edit.originalText);
    this.applyEdit(meetingId, edit.before, edit.after);
    return this.pushUndo(meetingId, { before: edit.before, after: edit.after });
  }

  private rememberTerm(term: string, misheard: string): void {
    this.terms = [
      ...this.terms,
      {
        id: this.id('term'),
        term,
        misheard: [misheard],
        contexts: [],
        enabled: true,
        history: [{ at: new Date().toISOString(), action: 'created', detail: 'From a correction' }],
      },
    ];
  }

  /** Swaps `from` for `to` in a meeting's transcript and tells the UI what changed. */
  private applyEdit(meetingId: string, from: TranscriptSegment[], to: TranscriptSegment[]): void {
    const segments = this.transcriptOf(meetingId);
    const kept = new Set(to.map((segment) => segment.id));
    const removedSegmentIds = from.map((segment) => segment.id).filter((id) => !kept.has(id));
    const next = segments.filter((segment) => !removedSegmentIds.includes(segment.id));
    for (const segment of to) {
      const index = next.findIndex((item) => item.id === segment.id);
      if (index >= 0) next[index] = segment;
      else next.push(segment);
    }
    next.sort((a, b) => a.startMs - b.startMs);
    segments.splice(0, segments.length, ...next);
    this.publishTranscriptChange(meetingId, { kind: 'replace', segments: to, removedSegmentIds });
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
    this.publishTranscriptChange(meetingId, { kind: 'append', segments: [segment] });
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
      if (this.armed.delete('startDenied')) {
        throw new ContractError({
          code: 'permissionDenied',
          message: 'Meeting Scribe does not have permission to use the microphone.',
        });
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
      this.transcripts.set(meetingId, []);
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
      this.meterTicker = setInterval(() => this.emitLevels(), METER_INTERVAL_MS);
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
      this.health = null;
    },
    getRecordingSnapshot: () => ({
      state: this.recording,
      health: this.health,
      transcription: this.lag,
    }),

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
        this.finishImportLater(importId, fileName, 300, () => this.emit('importFailed', failure));
        return { importId };
      }
      void fileToken;
      this.emit('importProgress', { importId, fileName, stage: 'decoding', fraction: 0.1 });
      this.finishImportLater(importId, fileName, 1500, () => {
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
      });
      return { importId };
    },
    cancelImport: ({ importId }) => {
      if (this.endedImports.has(importId)) return;
      const running = this.activeImports.get(importId);
      if (!running) {
        throw new ContractError({ code: 'notFound', message: 'That import no longer exists.' });
      }
      clearTimeout(running.timer);
      this.activeImports.delete(importId);
      this.endedImports.add(importId);
      this.emit('importCancelled', { importId, fileName: running.fileName });
    },

    listInputDevices: () => INPUT_DEVICES,
    listMeetingApps: () => MEETING_APPS,
    selectSources: (selection) => {
      this.settings = mergeSettings(this.settings, { audio: selection });
    },

    getTranscript: ({ meetingId, offset, limit }) => {
      const all = this.transcriptOf(meetingId);
      return {
        meetingId,
        revision: this.revisionOf(meetingId),
        totalSegments: all.length,
        totalWords: all.reduce((sum, segment) => sum + segment.words.length, 0),
        segments: all.slice(offset, offset + limit),
        speakers: MOCK_SPEAKERS,
      };
    },
    applyCorrection: ({ meetingId, range, text, remember }) =>
      this.correct(meetingId, range, text, remember),
    reassignSpeaker: ({ meetingId, range, speakerId }) => {
      const edit = reassignWordRange(this.transcriptOf(meetingId), range, speakerId);
      if (!edit) {
        throw new ContractError({ code: 'notFound', message: 'That text is no longer available.' });
      }
      this.applyEdit(meetingId, edit.before, edit.after);
      return this.pushUndo(meetingId, edit);
    },
    undo: ({ meetingId }) => this.moveUndo(meetingId, -1),
    redo: ({ meetingId }) => this.moveUndo(meetingId, 1),
    seekAudio: ({ meetingId, positionMs }) => this.playFrom(meetingId, positionMs),
    pauseAudio: ({ meetingId }) => {
      clearInterval(this.playbackTicker);
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

  private historyOf(meetingId: string) {
    const history = this.history.get(meetingId) ?? { undo: [], redo: [] };
    this.history.set(meetingId, history);
    return history;
  }

  private undoStateOf(meetingId: string) {
    const { undo, redo } = this.historyOf(meetingId);
    return { canUndo: undo.length > 0, canRedo: redo.length > 0 };
  }

  private pushUndo(meetingId: string, edit: TranscriptEdit) {
    const history = this.historyOf(meetingId);
    history.undo.push(edit);
    history.redo = [];
    return this.undoStateOf(meetingId);
  }

  private moveUndo(meetingId: string, direction: 1 | -1) {
    const history = this.historyOf(meetingId);
    const [source, target] =
      direction === -1 ? [history.undo, history.redo] : [history.redo, history.undo];
    const edit = source.pop();
    if (edit) {
      target.push(edit);
      if (direction === -1) this.applyEdit(meetingId, edit.after, edit.before);
      else this.applyEdit(meetingId, edit.before, edit.after);
    }
    return this.undoStateOf(meetingId);
  }
}
