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
  type ModelDownloadProgress,
  type ModelInfo,
  type ModelRole,
  type RecordingHealth,
  type RecordingState,
  type SettingsPatch,
  type Speaker,
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
import { createPrng } from './prng.ts';
import { SCRIPT, type ScriptStep } from './scripted-meeting.ts';
import { MOCK_SPEAKERS, generateSegment, generateTranscript } from './transcript.ts';
import { readStored, writeStored } from '../lib/stored-value.ts';

const SETTINGS_KEY = 'scrb.mock.settings';
const LONG_MEETING_WORDS = 80_000;
const SHORT_MEETING_WORDS = 2_000;
const FULL_DISK_BYTES = 180_000_000_000;
const PICKED_STORAGE_LOCATION = '/Users/example/Documents/Meeting Scribe';

/** Armed faults change what the next matching call does; see `dev-triggers.ts`. */
export type ArmedFault =
  | 'deleteFails'
  | 'exportFails'
  | 'importFails'
  | 'summaryFails'
  | 'modelDownloadFails'
  | 'profileDeleteFails'
  | 'permissionDenied'
  | 'noModelInfo'
  | 'modelsMissing';

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
  private readonly undoDepth = new Map<string, { undo: number; redo: number }>();
  private settings: AppSettings = mergeSettings(
    DEFAULT_SETTINGS,
    readStored<SettingsPatch>(SETTINGS_KEY) ?? {},
  );
  private library: MeetingDetail[] = createLibrary();
  private profiles: VoiceProfile[] = VOICE_PROFILES.map((profile) => ({ ...profile }));
  private terms: VocabularyTerm[] = VOCABULARY_TERMS.map((term) => ({ ...term }));
  private readonly meetingSpeakers = new Map<string, Speaker[]>();
  private readonly updatedModels = new Set<string>();
  private recording: RecordingState = {
    status: 'idle',
    meetingId: null,
    elapsedMs: 0,
    privacyBannerRequired: false,
  };
  private ticker: ReturnType<typeof setInterval> | undefined;
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

  setProfiles(profiles: VoiceProfile[]): void {
    this.profiles = profiles;
  }

  setTerms(terms: VocabularyTerm[]): void {
    this.terms = terms;
  }

  /** Replaces the library with its full sample state, clearing armed faults. */
  reset(): void {
    this.armed.clear();
    this.library = createLibrary();
    this.summaries.clear();
    this.profiles = VOICE_PROFILES.map((profile) => ({ ...profile }));
    this.terms = VOCABULARY_TERMS.map((term) => ({ ...term }));
    this.meetingSpeakers.clear();
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

  private speakersOf(meetingId: string): Speaker[] {
    return this.meetingSpeakers.get(meetingId) ?? MOCK_SPEAKERS;
  }

  private findSpeaker(meetingId: string, speakerId: string): Speaker {
    const speaker = this.speakersOf(meetingId).find((item) => item.id === speakerId);
    if (!speaker)
      throw new ContractError({ code: 'notFound', message: 'That speaker no longer exists.' });
    return speaker;
  }

  /** Replaces a meeting's speakers and moves the matching segments, then reports both. */
  private changeSpeakers(
    meetingId: string,
    speakers: Speaker[],
    changed: Speaker[],
    move?: { matches(segment: TranscriptSegment): boolean; to: string },
  ): void {
    const segments = this.transcriptOf(meetingId);
    const moved: TranscriptSegment[] = [];
    segments.forEach((segment, index) => {
      if (!move?.matches(segment)) return;
      const updated = { ...segment, speakerId: move.to };
      segments[index] = updated;
      moved.push(updated);
    });
    this.meetingSpeakers.set(meetingId, speakers);
    const revision = this.revisionOf(meetingId) + 1;
    this.revisions.set(meetingId, revision);
    this.emit('transcriptChanged', {
      meetingId,
      revision,
      change: {
        kind: 'replace',
        segments: moved,
        removedSegmentIds: moved.map((segment) => segment.id),
      },
      speakers: changed,
    });
  }

  /** The mock moves whole segments; the real backend splits a segment at the selected words. */
  private rangeMatcher(meetingId: string, range: WordRange) {
    const segments = this.transcriptOf(meetingId);
    const indexOfWord = (wordId: string) =>
      segments.findIndex((segment) => segment.words.some((word) => word.id === wordId));
    const first = indexOfWord(range.firstWordId);
    const last = indexOfWord(range.lastWordId);
    if (first < 0 || last < first) {
      throw new ContractError({ code: 'invalidRequest', message: 'That selection is not valid.' });
    }
    const ids = new Set(segments.slice(first, last + 1).map((segment) => segment.id));
    return (segment: TranscriptSegment) => ids.has(segment.id);
  }

  private renameMeetingSpeaker(meetingId: string, speakerId: string, patch: Partial<Speaker>) {
    const updated = { ...this.findSpeaker(meetingId, speakerId), ...patch };
    const speakers = this.speakersOf(meetingId).map((speaker) =>
      speaker.id === speakerId ? updated : speaker,
    );
    this.changeSpeakers(meetingId, speakers, [updated]);
    return updated;
  }

  private emitModelProgress(
    role: ModelRole,
    state: ModelDownloadProgress['state'],
    fraction: number,
    message?: string,
  ): void {
    const model = MODELS.find((item) => item.role === role) as ModelInfo;
    const update = MODEL_UPDATES.find((item) => item.role === role);
    const bytesTotal = update?.sizeBytes ?? model.sizeBytes;
    this.emit('modelDownloadProgress', {
      role,
      modelName: model.name,
      state,
      bytesDone: Math.round(bytesTotal * fraction),
      bytesTotal,
      ...(message ? { message } : {}),
    });
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
    const revision = this.revisionOf(meetingId) + 1;
    this.revisions.set(meetingId, revision);
    this.emit('transcriptChanged', {
      meetingId,
      revision,
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
        speakers: this.speakersOf(meetingId),
      };
    },
    applyCorrection: ({ meetingId }) => this.pushUndo(meetingId),
    reassignSpeaker: ({ meetingId, range, speakerId }) => {
      this.findSpeaker(meetingId, speakerId);
      this.changeSpeakers(meetingId, this.speakersOf(meetingId), [], {
        matches: this.rangeMatcher(meetingId, range),
        to: speakerId,
      });
      return this.pushUndo(meetingId);
    },
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
        return;
      }
      const { meetingId, speakerId } = target;
      const { profileId } = this.renameMeetingSpeaker(meetingId, speakerId, {
        label: name,
        kind: 'named',
      });
      this.profiles = this.profiles.map((profile) =>
        profile.id === profileId ? { ...profile, name } : profile,
      );
    },
    mergeSpeakers: (merge) => {
      if (merge.kind === 'profiles') {
        const from = this.profiles.find((profile) => profile.id === merge.from);
        this.profiles = this.profiles
          .filter((profile) => profile.id !== merge.from)
          .map((profile) =>
            profile.id === merge.into
              ? { ...profile, meetingCount: profile.meetingCount + (from?.meetingCount ?? 0) }
              : profile,
          );
        return;
      }
      const { meetingId, from, into } = merge;
      this.findSpeaker(meetingId, from);
      this.findSpeaker(meetingId, into);
      const speakers = this.speakersOf(meetingId).filter((speaker) => speaker.id !== from);
      this.changeSpeakers(meetingId, speakers, [], {
        matches: (segment) => segment.speakerId === from,
        to: into,
      });
    },
    splitSpeaker: ({ meetingId, range, newLabel }) => {
      const speaker: Speaker = {
        id: this.id('sp'),
        label: newLabel,
        kind: 'named',
        profileId: null,
      };
      this.changeSpeakers(meetingId, [...this.speakersOf(meetingId), speaker], [speaker], {
        matches: this.rangeMatcher(meetingId, range),
        to: speaker.id,
      });
      return { speakerId: speaker.id };
    },
    deleteProfile: ({ profileId }) =>
      new Promise((resolve, reject) => {
        const fails = this.armed.delete('profileDeleteFails');
        setTimeout(() => {
          if (fails) {
            const message = 'The voice data could not be deleted. Try again.';
            reject(new ContractError({ code: 'internal', message }));
            return;
          }
          this.profiles = this.profiles.filter((profile) => profile.id !== profileId);
          resolve();
        }, 500);
      }),
    answerSpeakerSuggestion: ({ meetingId, speakerId, profileId, accepted }) => {
      if (!accepted) return;
      const profile = this.profiles.find((item) => item.id === profileId);
      this.renameMeetingSpeaker(meetingId, speakerId, {
        label: profile?.name ?? 'Unnamed voice',
        kind: 'named',
        profileId,
      });
    },

    listTerms: () => this.terms,
    updateTerm: ({ id, patch }) => {
      const term = this.terms.find((item) => item.id === id);
      if (!term)
        throw new ContractError({ code: 'notFound', message: 'That term no longer exists.' });
      const at = new Date().toISOString();
      const history = [...term.history];
      if (patch.enabled === true && !term.enabled) {
        history.push({ at, action: 'enabled', detail: 'Turned on by you' });
      }
      if (patch.enabled === false && term.enabled) {
        history.push({ at, action: 'disabled', detail: 'Turned off by you' });
      }
      if (patch.term !== undefined && patch.term !== term.term) {
        history.push({ at, action: 'edited', detail: `Spelling changed from ${term.term}` });
      }
      for (const misheard of patch.misheard ?? []) {
        if (!term.misheard.includes(misheard)) {
          history.push({ at, action: 'misheardAdded', detail: misheard });
        }
      }
      const updated = { ...term, ...patch, history };
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
    pickStorageLocation: () => {
      this.settings = { ...this.settings, storageLocation: PICKED_STORAGE_LOCATION };
      writeStored(SETTINGS_KEY, this.settings);
      return this.settings;
    },
    checkModelUpdates: () =>
      MODEL_UPDATES.filter((update) => !this.updatedModels.has(update.role)),
    installModelUpdate: ({ role }) => {
      if (this.armed.delete('modelDownloadFails')) {
        this.emitModelProgress(role, 'failed', 0.2, 'The download stopped. Try again.');
        return;
      }
      this.emitModelProgress(role, 'downloading', 0.3);
      setTimeout(() => this.emitModelProgress(role, 'downloading', 0.7), 700);
      setTimeout(() => this.emitModelProgress(role, 'verifying', 1), 1400);
      setTimeout(() => {
        this.updatedModels.add(role);
        this.emitModelProgress(role, 'done', 1);
      }, 2100);
    },
    revertModel: ({ role }) => {
      this.updatedModels.delete(role);
    },

    getSetupStatus: () => {
      const missing = this.armed.has('modelsMissing');
      const denied = this.armed.has('permissionDenied');
      return {
        models: MODELS.map((model) => ({
          ...model,
          installed: !missing,
          version: this.updatedModels.has(model.role)
            ? (MODEL_UPDATES.find((update) => update.role === model.role)?.availableVersion ??
              model.version)
            : model.version,
        })),
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
