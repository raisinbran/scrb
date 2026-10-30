import {
  ContractError,
  isValidRequest,
  type AppSettings,
  type AudioCheckStatus,
  type Backend,
  type BackendCalls,
  type BackendEvents,
  type CallName,
  type DeleteResult,
  type EventName,
  type ImportFailureReason,
  type ImportStage,
  type MeetingDetail,
  type MeetingFilter,
  type MeetingListItem,
  type MeetingSummaryDoc,
  type ModelDownloadProgress,
  type ModelInfo,
  type ModelRole,
  type PickedAudioFile,
  type RecordingHealth,
  type RecordingState,
  type SearchMatch,
  type SettingsPatch,
  type Speaker,
  type SummaryItemUpdate,
  type SummaryLength,
  type SummaryStage,
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
import {
  MOCK_SPEAKERS,
  generateSegment,
  generateTranscript,
  withWordStates,
} from './transcript.ts';
import { readStored, writeStored } from '../lib/stored-value.ts';

const SETTINGS_KEY = 'scrb.mock.settings';
const LONG_MEETING_WORDS = 80_000;
const SHORT_MEETING_WORDS = 8_000;
const FULL_DISK_BYTES = 180_000_000_000;
const METER_INTERVAL_MS = 120;
/** How many of the newest live segments stay provisional before the live pass confirms them. */
const PROVISIONAL_SEGMENTS = 4;
const IMPORT_STEP_MS = 600;
const SUMMARY_STEP_MS = 600;
const PLAYBACK_STEP_MS = 250;
const SLOW_DELETE_MS = 1500;
const MAX_SEARCH_MATCHES = 5;
const PICKED_FILE: Omit<PickedAudioFile, 'fileToken'> = {
  fileName: 'Client interview.m4a',
  sizeBytes: 42_000_000,
  fileDate: '2026-10-21T15:00:00Z',
};
const IMPORT_STEPS: { stage: ImportStage; fraction: number }[] = [
  { stage: 'decoding', fraction: 0.1 },
  { stage: 'transcribing', fraction: 0.45 },
  { stage: 'diarizing', fraction: 0.8 },
  { stage: 'finishing', fraction: 0.95 },
];
const SUMMARY_STEPS: { stage: SummaryStage; fraction: number }[] = [
  { stage: 'extracting', fraction: 0.2 },
  { stage: 'coverageCheck', fraction: 0.55 },
  { stage: 'writing', fraction: 0.8 },
];
const IMPORT_FAULTS = {
  importFails: {
    reason: 'unreadable',
    message: 'This file could not be read. It may be damaged or not an audio file.',
  },
  importUnsupported: {
    reason: 'unsupportedFormat',
    message: 'This file type is not supported. Use a WAV, MP3, M4A, FLAC or Opus audio file.',
  },
  importDiskFull: {
    reason: 'diskFull',
    message: 'There is not enough disk space to import this file.',
  },
} as const;
const PICKED_STORAGE_LOCATION = '/Users/example/Documents/Meeting Scribe';

/** Armed faults change what the next matching call does; see `dev-triggers.ts`. */
export type ArmedFault =
  | 'deleteFails'
  | 'exportFails'
  | keyof typeof IMPORT_FAULTS
  | 'pickerCancelled'
  | 'deleteSlow'
  | 'summaryFails'
  | 'summaryStalls'
  | 'modelDownloadFails'
  | 'profileDeleteFails'
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

function inDateRange(startedAt: string, { from, to }: MeetingFilter): boolean {
  const day = startedAt.slice(0, 10);
  return (!from || day >= from.slice(0, 10)) && (!to || day <= to.slice(0, 10));
}

function replaceById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.map((existing) => (existing.id === item.id ? item : existing));
}

/** A new item takes the place of its old copy unless the user edited that copy. */
function keepEdited<T extends { id: string; edited: boolean }>(fresh: T[], previous: T[]): T[] {
  const edited = previous.filter((item) => item.edited);
  return [
    ...fresh.map((item) => edited.find((old) => old.id === item.id) ?? item),
    ...edited.filter((old) => !fresh.some((item) => item.id === old.id)),
  ];
}

function hasEdits(summary: MeetingSummaryDoc): boolean {
  return [
    ...summary.actionItems,
    ...summary.decisions,
    ...summary.openQuestions,
    ...(summary.narrative.brief ?? []),
    ...(summary.narrative.full ?? []),
  ].some((item) => item.edited);
}

function withItem(summary: MeetingSummaryDoc, update: SummaryItemUpdate): MeetingSummaryDoc {
  switch (update.kind) {
    case 'narrative': {
      const item = { ...update.item, edited: true };
      const { brief, full } = summary.narrative;
      return {
        ...summary,
        narrative: {
          brief: brief && replaceById(brief, item),
          full: full && replaceById(full, item),
        },
      };
    }
    case 'actionItem':
      return {
        ...summary,
        actionItems: replaceById(summary.actionItems, { ...update.item, edited: true }),
      };
    case 'decision':
      return {
        ...summary,
        decisions: replaceById(summary.decisions, { ...update.item, edited: true }),
      };
    case 'openQuestion':
      return {
        ...summary,
        openQuestions: replaceById(summary.openQuestions, { ...update.item, edited: true }),
      };
  }
}

function finalized(segment: TranscriptSegment): TranscriptSegment {
  return finalizeProvisionalWords(segment) ?? segment;
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
  private readonly meetingSpeakers = new Map<string, Speaker[]>();
  private readonly updatedModels = new Set<string>();
  private recording: RecordingState = {
    status: 'idle',
    meetingId: null,
    elapsedMs: 0,
    pauseReason: null,
    privacyBannerRequired: false,
  };
  private audioCheckTimer: Timer | undefined;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private meterTicker: ReturnType<typeof setInterval> | undefined;
  private readonly meterPrng = createPrng(20261031);
  private second = 0;
  private readonly revisions = new Map<string, number>();
  private readonly activeImports = new Map<string, { fileName: string; timer: Timer }>();
  private readonly pickedFiles = new Map<string, PickedAudioFile>();
  private playback: { meetingId: string; positionMs: number } | null = null;
  private playbackTimer: ReturnType<typeof setInterval> | undefined;
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
    if (name === 'summaryOutdated') {
      this.setSummaryState((payload as { meetingId: string }).meetingId, 'outdated');
    }
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
    this.transcripts.clear();
    this.history.clear();
    this.profiles = VOICE_PROFILES.map((profile) => ({ ...profile }));
    this.terms = VOCABULARY_TERMS.map((term) => ({ ...term }));
    this.meetingSpeakers.clear();
    this.stopPlayback();
  }

  /** What the end of a real final pass looks like to the UI: final words and a ready meeting. */
  finishFinalPass(): void {
    for (const meeting of this.library) {
      if (meeting.status !== 'finalPassRunning') continue;
      const segments = this.transcripts.get(meeting.id);
      if (segments) this.transcripts.set(meeting.id, segments.map(finalized));
      this.rewriteHistory(meeting.id, finalized);
      this.updateMeetingStatus(meeting.id, { status: 'ready' });
    }
  }

  updateMeetingStatus(meetingId: string, patch: Partial<MeetingDetail>): void {
    this.library = this.library.map((meeting) =>
      meeting.id === meetingId ? { ...meeting, ...patch } : meeting,
    );
  }

  dispose(): void {
    this.stopRecordingTimers();
    this.stopPlayback();
  }

  private stopRecordingTimers(): void {
    clearInterval(this.ticker);
    clearInterval(this.meterTicker);
    this.ticker = undefined;
    this.meterTicker = undefined;
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
      const generated = generateTranscript(meetingId, words, meetingId.length * 7919).segments;
      const finalPass = this.findMeeting(meetingId).status === 'finalPassRunning';
      segments = withWordStates(generated, finalPass ? 'provisional' : 'final');
      this.transcripts.set(meetingId, segments);
    }
    return segments;
  }

  private endAudioCheck(endReason: NonNullable<AudioCheckStatus['endReason']>): void {
    if (this.audioCheckTimer === undefined) return;
    clearTimeout(this.audioCheckTimer);
    this.audioCheckTimer = undefined;
    this.emit('audioCheck', {
      active: false,
      micDevice: null,
      micResult: 'listening',
      meetingResult: 'notChecked',
      endReason,
    });
  }

  private revisionOf(meetingId: string): number {
    return this.revisions.get(meetingId) ?? 0;
  }

  /** Reports each stage in turn, then runs `end`. Cancelling stops the pending stage's timer. */
  private runImportStages(importId: string, fileName: string, step: number, end: () => void) {
    const next = IMPORT_STEPS[step];
    if (!next) {
      this.finishImportLater(importId, fileName, IMPORT_STEP_MS, end);
      return;
    }
    this.emit('importProgress', { importId, fileName, ...next });
    const timer = setTimeout(
      () => this.runImportStages(importId, fileName, step + 1, end),
      IMPORT_STEP_MS,
    );
    this.activeImports.set(importId, { fileName, timer });
  }

  private failImportLater(
    importId: string,
    fileName: string,
    failure: { reason: ImportFailureReason; message: string },
  ) {
    this.finishImportLater(importId, fileName, 300, () =>
      this.emit('importFailed', { importId, fileName, ...failure }),
    );
  }

  /** Owner decision 4: a recording that starts during an import stops the import. */
  private stopImportsForRecording(): void {
    for (const [importId, { fileName, timer }] of this.activeImports) {
      clearTimeout(timer);
      this.activeImports.delete(importId);
      this.endedImports.add(importId);
      this.emit('importFailed', {
        importId,
        fileName,
        reason: 'recordingInProgress',
        message: 'A recording started, so this import stopped. Try it again after the recording.',
      });
    }
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
    const added = speakers.length - this.speakersOf(meetingId).length;
    if (added !== 0) {
      const { speakerCount } = this.findMeeting(meetingId);
      this.updateMeetingStatus(meetingId, { speakerCount: speakerCount + added });
    }
    this.meetingSpeakers.set(meetingId, speakers);
    this.publishTranscriptChange(
      meetingId,
      { kind: 'replace', segments: moved, removedSegmentIds: [] },
      changed,
    );
    this.markSummaryOutdated(meetingId);
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

  private setSummaryState(meetingId: string, state: MeetingSummaryDoc['state']): void {
    const summary = this.summaryOf(meetingId);
    this.summaries.set(meetingId, { ...summary, state });
    this.updateMeetingStatus(meetingId, { summaryState: state });
  }

  /** Reports each stage in turn, then writes one length and keeps every edited item. */
  private runSummaryStages(meetingId: string, length: SummaryLength, step: number): void {
    const next = SUMMARY_STEPS[step];
    if (next) {
      this.emit('summaryProgress', { meetingId, ...next });
      setTimeout(() => this.runSummaryStages(meetingId, length, step + 1), SUMMARY_STEP_MS);
      return;
    }
    if (!this.library.some((meeting) => meeting.id === meetingId)) return;
    const previous = this.summaryOf(meetingId);
    const fresh = createSummary(meetingId, 'ready');
    const merged: MeetingSummaryDoc = {
      ...fresh,
      narrative: {
        ...previous.narrative,
        [length]: keepEdited(fresh.narrative[length] ?? [], previous.narrative[length] ?? []),
      },
      actionItems: keepEdited(fresh.actionItems, previous.actionItems),
      decisions: keepEdited(fresh.decisions, previous.decisions),
      openQuestions: keepEdited(fresh.openQuestions, previous.openQuestions),
    };
    const state = hasEdits(merged) ? 'edited' : 'ready';
    this.summaries.set(meetingId, { ...merged, state });
    this.updateMeetingStatus(meetingId, { summaryState: state });
    this.emit('summaryProgress', { meetingId, stage: 'done', fraction: 1 });
  }

  private stopPlayback(): void {
    clearInterval(this.playbackTimer);
    this.playback = null;
  }

  /** A meeting still recording keeps `durationMs` at 0 until it stops, so its end is the live text. */
  private audioEndMs(meetingId: string): number {
    if (this.recording.meetingId === meetingId) return this.liveStartMs;
    return this.library.find((meeting) => meeting.id === meetingId)?.durationMs ?? 0;
  }

  private startPlayback(meetingId: string, positionMs: number): void {
    this.stopPlayback();
    this.findMeeting(meetingId);
    const playback = { meetingId, positionMs: Math.min(positionMs, this.audioEndMs(meetingId)) };
    this.emit('playbackPosition', { ...playback, isPlaying: true });
    this.playback = playback;
    this.playbackTimer = setInterval(() => {
      const endMs = this.audioEndMs(meetingId);
      playback.positionMs = Math.min(playback.positionMs + PLAYBACK_STEP_MS, endMs);
      const isPlaying = playback.positionMs < endMs;
      this.emit('playbackPosition', { ...playback, isPlaying });
      if (!isPlaying) this.stopPlayback();
    }, PLAYBACK_STEP_MS);
  }

  private textMatches(meetingId: string, needle: string): SearchMatch[] {
    const matches: SearchMatch[] = [];
    for (const segment of this.transcriptOf(meetingId)) {
      const snippet = segment.words.map((word) => word.text).join(' ');
      if (snippet.toLowerCase().includes(needle)) {
        matches.push({ segmentId: segment.id, startMs: segment.startMs, snippet });
      }
      if (matches.length === MAX_SEARCH_MATCHES) break;
    }
    return matches;
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
    speakers: Speaker[] = [],
  ): void {
    const revision = this.revisionOf(meetingId) + 1;
    this.revisions.set(meetingId, revision);
    this.emit('transcriptChanged', { meetingId, revision, change, speakers });
  }

  /** Requirements: after transcript edits, the summary shows "May be outdated". */
  private markSummaryOutdated(meetingId: string): void {
    const state = this.library.find((meeting) => meeting.id === meetingId)?.summaryState;
    if (state === 'ready' || state === 'edited') this.emit('summaryOutdated', { meetingId });
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
        id: this.id('term-learned'),
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
    this.markSummaryOutdated(meetingId);
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
        this.setRecording({ status: 'paused', pauseReason: 'user' });
        break;
      case 'resume':
        this.setRecording({ status: 'recording', pauseReason: null });
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
      this.stopImportsForRecording();
      this.endAudioCheck('recordingStarted');
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
    pauseRecording: () => this.setRecording({ status: 'paused', pauseReason: 'user' }),
    resumeRecording: () => this.setRecording({ status: 'recording', pauseReason: null }),
    stopRecording: () => {
      this.stopRecordingTimers();
      const meetingId = this.recording.meetingId;
      if (meetingId && this.playback?.meetingId === meetingId) {
        const { positionMs } = this.playback;
        this.stopPlayback();
        this.emit('playbackPosition', { meetingId, positionMs, isPlaying: false });
      }
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

    pickAudioFile: () => {
      if (this.armed.delete('pickerCancelled')) return null;
      const file = { ...PICKED_FILE, fileToken: this.id('file') };
      this.pickedFiles.set(file.fileToken, file);
      return file;
    },
    importAudioFile: ({ fileToken }) => {
      const importId = this.id('import');
      const { fileName, fileDate } = this.pickedFiles.get(fileToken) ?? PICKED_FILE;
      if (this.recording.status !== 'idle') {
        this.failImportLater(importId, fileName, {
          reason: 'recordingInProgress',
          message: 'A recording is running. Try this import again after the recording.',
        });
        return { importId };
      }
      for (const fault of ['importFails', 'importUnsupported', 'importDiskFull'] as const) {
        if (this.armed.delete(fault)) {
          this.failImportLater(importId, fileName, IMPORT_FAULTS[fault]);
          return { importId };
        }
      }
      this.runImportStages(importId, fileName, 0, () => {
        const meetingId = this.id('meeting-import');
        this.library = [
          {
            id: meetingId,
            title: fileName,
            startedAt: fileDate,
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

    startAudioCheck: () => {
      if (this.recording.status !== 'idle') {
        throw new ContractError({ code: 'conflict', message: 'Stop recording to test the mic.' });
      }
      this.audioCheckTimer = setTimeout(() => this.endAudioCheck('timedOut'), 120_000);
      this.emit('audioCheck', {
        active: true,
        micDevice: INPUT_DEVICES[0] ?? null,
        micResult: 'hearing',
        meetingResult: 'notChecked',
      });
      this.emit('levelMeter', { micDb: -24, meetingDb: null });
    },
    stopAudioCheck: () => this.endAudioCheck('stopped'),

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
    applyCorrection: ({ meetingId, range, text, remember }) =>
      this.correct(meetingId, range, text, remember),
    reassignSpeaker: ({ meetingId, range, speakerId }) => {
      this.findSpeaker(meetingId, speakerId);
      const edit = reassignWordRange(this.transcriptOf(meetingId), range, speakerId);
      if (!edit) {
        throw new ContractError({ code: 'notFound', message: 'That text is no longer available.' });
      }
      this.applyEdit(meetingId, edit.before, edit.after);
      return this.pushUndo(meetingId, edit);
    },
    undo: ({ meetingId }) => this.moveUndo(meetingId, -1),
    redo: ({ meetingId }) => this.moveUndo(meetingId, 1),
    seekAudio: ({ meetingId, positionMs }) => this.startPlayback(meetingId, positionMs),
    pauseAudio: ({ meetingId }) => {
      const positionMs = this.playback?.meetingId === meetingId ? this.playback.positionMs : 0;
      this.stopPlayback();
      this.emit('playbackPosition', { meetingId, positionMs, isPlaying: false });
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
      this.rewriteHistory(meetingId, (segment) =>
        segment.speakerId === from ? { ...segment, speakerId: into } : segment,
      );
    },
    splitSpeaker: ({ meetingId, range, newLabel }) => {
      const speaker: Speaker = {
        id: this.id('sp-split'),
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
    generateSummary: ({ meetingId, length }) => {
      this.findMeeting(meetingId);
      if (this.armed.delete('summaryFails')) {
        const message = 'The summary could not be generated. Try again.';
        this.emit('summaryProgress', { meetingId, stage: 'failed', fraction: 0, message });
        return;
      }
      this.setSummaryState(meetingId, 'generating');
      if (this.armed.delete('summaryStalls')) {
        this.emit('summaryProgress', { meetingId, stage: 'extracting', fraction: 0.2 });
        return;
      }
      this.runSummaryStages(meetingId, length, 0);
    },
    updateSummaryItem: ({ meetingId, update }) => {
      const summary = this.summaryOf(meetingId);
      const state = summary.state === 'outdated' ? 'outdated' : 'edited';
      const updated = { ...withItem(summary, update), state } as const;
      this.summaries.set(meetingId, updated);
      this.updateMeetingStatus(meetingId, { summaryState: state });
      return updated;
    },

    listMeetings: ({ filter }) =>
      this.library
        .filter((meeting) => !filter?.origin || meeting.origin === filter.origin)
        .filter((meeting) => !filter || inDateRange(meeting.startedAt, filter))
        .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map(toListItem),
    getMeeting: ({ meetingId }) => this.findMeeting(meetingId),
    updateMeeting: ({ meetingId, ...patch }) => {
      this.updateMeetingStatus(meetingId, patch);
      return this.findMeeting(meetingId);
    },
    searchMeetings: ({ query }) => {
      const needle = query.toLowerCase();
      return this.library.flatMap((meeting) => {
        const inIndex =
          meeting.title.toLowerCase().includes(needle) || meeting.startedAt.includes(needle);
        const matches = [
          ...(inIndex ? [{ segmentId: null, startMs: null, snippet: null }] : []),
          ...this.textMatches(meeting.id, needle),
        ];
        return matches.length > 0 ? [{ meeting: toListItem(meeting), matches }] : [];
      });
    },
    deleteMeeting: async ({ meetingId }): Promise<DeleteResult> => {
      this.findMeeting(meetingId);
      if (this.armed.delete('deleteSlow')) {
        this.updateMeetingStatus(meetingId, { status: 'deleting' });
        await new Promise((resolve) => setTimeout(resolve, SLOW_DELETE_MS));
      }
      if (this.armed.delete('deleteFails')) {
        return { verified: false, remaining: ['Audio folder'] };
      }
      this.library = this.library.filter((meeting) => meeting.id !== meetingId);
      this.transcripts.delete(meetingId);
      this.summaries.delete(meetingId);
      this.history.delete(meetingId);
      this.meetingSpeakers.delete(meetingId);
      return { verified: true, remaining: [] };
    },
    openMeetingFolder: () => undefined,
    exportMeeting: ({ meetingId, format }) => {
      const exportId = this.id('export');
      const ok = !this.armed.delete('exportFails');
      const { title } = this.findMeeting(meetingId);
      setTimeout(() => {
        this.emit(
          'exportFinished',
          ok
            ? { exportId, meetingId, ok, fileName: `${title}.${format}` }
            : { exportId, meetingId, ok, message: 'The export could not be saved.' },
        );
      }, 900);
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
    checkModelUpdates: () => MODEL_UPDATES.filter((update) => !this.updatedModels.has(update.role)),
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

  private historyOf(meetingId: string) {
    const history = this.history.get(meetingId) ?? { undo: [], redo: [] };
    this.history.set(meetingId, history);
    return history;
  }

  /** Keeps undo from bringing back a state that no longer exists, such as a merged speaker. */
  private rewriteHistory(
    meetingId: string,
    rewrite: (segment: TranscriptSegment) => TranscriptSegment,
  ): void {
    const { undo, redo } = this.historyOf(meetingId);
    for (const edit of [...undo, ...redo]) {
      edit.before = edit.before.map(rewrite);
      edit.after = edit.after.map(rewrite);
    }
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
