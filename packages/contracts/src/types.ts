/**
 * Shared data types for the UI/backend contract.
 *
 * DRAFT: awaiting owner approval.
 *
 * Units: every `...Ms` is milliseconds on the meeting timeline (0 = meeting start), except where
 * noted. Every `...At` is an ISO 8601 UTC string.
 */

export type MeetingId = string;
export type SegmentId = string;
export type WordId = string;
export type SpeakerId = string;
export type ProfileId = string;
export type CorrectionId = string;
export type TermId = string;
export type ImportId = string;
export type ExportId = string;
export type SummaryItemId = string;

export type TrackKind = 'microphone' | 'meeting';

// Recording and capture

export type RecordingStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping';

export interface RecordingState {
  status: RecordingStatus;
  /** Null only while `status` is `idle`. */
  meetingId: MeetingId | null;
  /** Recorded time at the moment of this event, excluding paused spans. */
  elapsedMs: number;
  /** True when the privacy banner must show for this recording. The backend applies the rule. */
  privacyBannerRequired: boolean;
}

export type RecordingWarningKind =
  | 'micSilent'
  | 'lowDisk'
  | 'deviceChanged'
  | 'permissionLost'
  | 'audioMissing'
  | 'bluetoothHandsFreeMic';

export interface RecordingWarning {
  kind: RecordingWarningKind;
  message: string;
  /** Meeting time the warning was raised. */
  atMs: number;
}

/** Recording health only. Transcription problems are reported separately by `TranscriptionLag`. */
export interface RecordingHealth {
  level: 'ok' | 'warning' | 'failed';
  warnings: RecordingWarning[];
  diskFreeBytes: number;
}

export type TranscriptionStatus = 'ok' | 'lagging' | 'failed' | 'restarting' | 'off';

export interface TranscriptionLag {
  status: TranscriptionStatus;
  lagMs: number;
}

export type InputTransport = 'builtIn' | 'usb' | 'bluetooth' | 'bluetoothHandsFree' | 'other';

export interface InputDevice {
  id: string;
  name: string;
  isSystemDefault: boolean;
  transport: InputTransport;
}

/** `whole-computer` is always offered as the fallback source. */
export const WHOLE_COMPUTER_SOURCE_ID = 'whole-computer';

export interface MeetingApp {
  id: string;
  name: string;
  kind: 'app' | 'browser' | 'wholeComputer';
  isRunning: boolean;
}

export interface SourceSelection {
  /** Null follows the system default microphone. */
  micDeviceId: string | null;
  meetingAppId: string;
}

export interface DeviceChange {
  kind: 'added' | 'removed' | 'defaultChanged';
  device: InputDevice;
  /** Set when a selected mic vanished and the backend fell back to another device. */
  fallbackDevice?: InputDevice;
  /** True when the UI should prompt "Audio device suggestions". */
  suggestSwitch: boolean;
}

export interface LevelMeter {
  /** dBFS, -100 to 0. */
  micDb: number;
  /** dBFS, -100 to 0. */
  meetingDb: number;
}

// Import

export const IMPORT_AUDIO_EXTENSIONS = ['wav', 'mp3', 'm4a', 'flac', 'opus'] as const;
export type ImportAudioExtension = (typeof IMPORT_AUDIO_EXTENSIONS)[number];

/**
 * A file the user chose in the native picker. The renderer holds a token rather than a path, so
 * a compromised renderer cannot ask the backend to open arbitrary files.
 */
export interface PickedAudioFile {
  fileToken: string;
  fileName: string;
  sizeBytes: number;
  /** The file's date, used as the meeting's default date. */
  fileDate: string;
}

export type ImportStage = 'queued' | 'decoding' | 'transcribing' | 'diarizing' | 'finishing';

export interface ImportProgress {
  importId: ImportId;
  fileName: string;
  stage: ImportStage;
  /** 0 to 1 across the whole import. */
  fraction: number;
}

export interface ImportFinished {
  importId: ImportId;
  meetingId: MeetingId;
}

export type ImportFailureReason =
  | 'unreadable'
  | 'unsupportedFormat'
  | 'recordingInProgress'
  | 'diskFull'
  | 'internal';

export interface ImportFailed {
  importId: ImportId;
  fileName: string;
  reason: ImportFailureReason;
  /** Plain-language reason for the user. */
  message: string;
}

// Meetings and transcript

export type MeetingStatus =
  | 'recording'
  | 'paused'
  | 'finalPassRunning'
  | 'ready'
  | 'recovered'
  | 'importing'
  | 'deleting';

export type SummaryState = 'notGenerated' | 'generating' | 'ready' | 'edited' | 'outdated';

/** One row of the library. Comes from the index, so it holds no transcript text. */
export interface MeetingListItem {
  id: MeetingId;
  title: string;
  startedAt: string;
  durationMs: number;
  origin: 'recorded' | 'imported';
  status: MeetingStatus;
  summaryState: SummaryState;
  speakerCount: number;
}

export interface MeetingDetail extends MeetingListItem {
  /** Paused and missing spans, in timeline order. */
  gaps: TimelineGap[];
  /** Set on a recovered meeting: where the recording ended. */
  recoveredEndMs?: number;
}

export interface TimelineGap {
  kind: 'paused' | 'audioMissing' | 'computerAsleep';
  startMs: number;
  endMs: number;
}

export interface Speaker {
  id: SpeakerId;
  /** "You", "Speaker 2" or a profile name. */
  label: string;
  kind: 'you' | 'unknown' | 'named';
  profileId: ProfileId | null;
}

/** The backend decides this state. The UI only styles it. */
export type WordState = 'provisional' | 'final' | 'corrected';

export interface TranscriptWord {
  id: WordId;
  /** The text to display. A user correction already won here; the model's text stays backend-side. */
  text: string;
  startMs: number;
  endMs: number;
  state: WordState;
  correctionId: CorrectionId | null;
}

export interface TranscriptSegment {
  id: SegmentId;
  speakerId: SpeakerId;
  track: TrackKind;
  startMs: number;
  endMs: number;
  words: TranscriptWord[];
}

/** Change events are small: an 8-hour transcript is never resent whole. */
export type TranscriptChange =
  | { kind: 'append'; segments: TranscriptSegment[] }
  | { kind: 'replace'; segments: TranscriptSegment[]; removedSegmentIds: SegmentId[] }
  | { kind: 'realign'; words: Pick<TranscriptWord, 'id' | 'startMs' | 'endMs'>[] };

export interface TranscriptChanged {
  meetingId: MeetingId;
  /** Increases by one per change. A skipped value means the UI must reload the range. */
  revision: number;
  change: TranscriptChange;
  /** Speakers that are new or changed by this event. */
  speakers: Speaker[];
}

export interface TranscriptPage {
  meetingId: MeetingId;
  revision: number;
  totalSegments: number;
  totalWords: number;
  /** Segments `offset` to `offset + limit`, by timeline order. */
  segments: TranscriptSegment[];
  speakers: Speaker[];
}

export interface WordRange {
  firstWordId: WordId;
  lastWordId: WordId;
}

export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface PlaybackPosition {
  meetingId: MeetingId;
  positionMs: number;
  isPlaying: boolean;
}

// Speakers

export interface VoiceProfile {
  id: ProfileId;
  /** Null until the user names it. */
  name: string | null;
  meetingCount: number;
  lastHeardAt: string;
}

export type SpeakerTarget =
  | { kind: 'meetingSpeaker'; meetingId: MeetingId; speakerId: SpeakerId }
  | { kind: 'profile'; profileId: ProfileId };

export type SpeakerMerge =
  | { kind: 'meetingSpeakers'; meetingId: MeetingId; from: SpeakerId; into: SpeakerId }
  | { kind: 'profiles'; from: ProfileId; into: ProfileId };

export interface SpeakerSuggestion {
  meetingId: MeetingId;
  speakerId: SpeakerId;
  profileId: ProfileId;
  profileName: string;
}

// Vocabulary

export interface VocabularyHistoryEntry {
  at: string;
  action: 'created' | 'edited' | 'disabled' | 'enabled' | 'misheardAdded';
  detail: string;
}

export interface VocabularyTerm {
  id: TermId;
  term: string;
  misheard: string[];
  /** Surrounding words the backend uses for context-aware fixes. */
  contexts: string[];
  enabled: boolean;
  history: VocabularyHistoryEntry[];
}

export type VocabularyTermPatch = Partial<Pick<VocabularyTerm, 'term' | 'misheard' | 'enabled'>>;

// Summary

export type SummaryLength = 'brief' | 'full';

/** Items with unknown details use null, which the UI shows as "Not specified" or "Unconfirmed". */
export interface ActionItem {
  id: SummaryItemId;
  action: string;
  owner: string | null;
  deadline: string | null;
  status: 'open' | 'done' | 'unconfirmed';
  sourceMs: number;
  edited: boolean;
}

export type DecisionStatus = 'decided' | 'proposed' | 'tentativelyAgreed' | 'unresolved';

export type ImpactArea =
  | 'scope'
  | 'schedule'
  | 'cost'
  | 'risk'
  | 'deliverables'
  | 'technicalApproach';

export interface DecisionItem {
  id: SummaryItemId;
  decision: string;
  status: DecisionStatus;
  impactArea: ImpactArea | null;
  sourceMs: number;
  edited: boolean;
}

export interface OpenQuestion {
  id: SummaryItemId;
  question: string;
  sourceMs: number | null;
  edited: boolean;
}

export interface NarrativeSection {
  id: SummaryItemId;
  heading: string | null;
  text: string;
  edited: boolean;
}

export interface MeetingSummaryDoc {
  meetingId: MeetingId;
  state: SummaryState;
  generatedAt: string | null;
  /** A length is null until generated. Both lengths share the tables below. */
  narrative: Record<SummaryLength, NarrativeSection[] | null>;
  actionItems: ActionItem[];
  decisions: DecisionItem[];
  openQuestions: OpenQuestion[];
}

export type SummaryItemUpdate =
  | { kind: 'narrative'; item: NarrativeSection }
  | { kind: 'actionItem'; item: ActionItem }
  | { kind: 'decision'; item: DecisionItem }
  | { kind: 'openQuestion'; item: OpenQuestion };

export type SummaryStage = 'extracting' | 'coverageCheck' | 'writing' | 'done' | 'failed';

export interface SummaryProgress {
  meetingId: MeetingId;
  stage: SummaryStage;
  /** 0 to 1 across the whole run. */
  fraction: number;
  /** Plain-language reason, set when `stage` is `failed`. */
  message?: string;
}

// Library

export interface MeetingFilter {
  origin?: MeetingListItem['origin'];
  /** Inclusive ISO date bounds on `startedAt`. */
  from?: string;
  to?: string;
}

export interface SearchMatch {
  segmentId: SegmentId | null;
  startMs: number | null;
  /** Null for a title or date match. */
  snippet: string | null;
}

export interface SearchResult {
  meeting: MeetingListItem;
  matches: SearchMatch[];
}

export interface DeleteResult {
  /** False when the post-delete check found something left. */
  verified: boolean;
  /** Plain-language names of anything left behind. */
  remaining: string[];
}

export type MeetingFolder = 'meeting' | 'audio' | 'exports';

export type ExportContent = 'transcript' | 'summary' | 'both';
export type ExportFormat = 'docx' | 'pdf';

export interface TranscriptExportOptions {
  title: boolean;
  date: boolean;
  duration: boolean;
  speakerNames: boolean;
  timestamps: boolean;
  showCorrections: boolean;
}

/** The action-item and decision tables are always included, so they have no option. */
export interface SummaryExportOptions {
  length: SummaryLength;
  openQuestions: boolean;
  sourceTimestamps: boolean;
}

export interface ExportRequest {
  meetingId: MeetingId;
  content: ExportContent;
  format: ExportFormat;
  transcript: TranscriptExportOptions;
  summary: SummaryExportOptions;
}

export type ExportFinished =
  | { exportId: ExportId; meetingId: MeetingId; ok: true; fileName: string }
  | { exportId: ExportId; meetingId: MeetingId; ok: false; message: string };

// Settings and models

export type ThemeSetting = 'light' | 'dark' | 'system';
export type AudioPreset = 'voiceIsolation' | 'studio' | 'custom';
export type NoiseSuppression = 'off' | 'standard' | 'strong';
export type TranscriptionQuality = 'fast' | 'balanced' | 'accurate';
export type AutoDeletePeriod = '30d' | '90d' | '180d' | '1y' | 'never';
export type AutoDeleteScope = 'audioOnly' | 'wholeMeeting';

export interface AudioSettings extends SourceSelection {
  preset: AudioPreset;
  /** -100 to 0 dB, or `auto`. Sets what the transcriber treats as speech; never cuts recorded audio. */
  inputSensitivityDb: number | 'auto';
  noiseSuppression: NoiseSuppression;
  echoCancellation: boolean;
  automaticGainControl: boolean;
  advancedVoiceActivity: boolean;
  bypassSystemInputProcessing: boolean;
  noAudioWarning: boolean;
  deviceSuggestions: boolean;
}

export interface AppSettings {
  audio: AudioSettings;
  transcriptionQuality: TranscriptionQuality;
  summaryDefaultLength: SummaryLength;
  storageLocation: string;
  autoDelete: { period: AutoDeletePeriod; scope: AutoDeleteScope };
  /** ISO 3166-1 alpha-2 country and, in the US, a two-letter state. Null until first launch. */
  location: { country: string | null; usState: string | null };
  theme: ThemeSetting;
  transcriptFontPx: number;
}

/** Top-level keys are shallow-merged; `audio`, `autoDelete` and `location` merge one level down. */
export type SettingsPatch = Partial<Omit<AppSettings, 'audio' | 'autoDelete' | 'location'>> & {
  audio?: Partial<AudioSettings>;
  autoDelete?: Partial<AppSettings['autoDelete']>;
  location?: Partial<AppSettings['location']>;
};

export type ModelRole = 'liveSpeech' | 'finalSpeech' | 'speaker' | 'summary';

export interface ModelInfo {
  role: ModelRole;
  name: string;
  version: string;
  installed: boolean;
  sizeBytes: number;
}

export interface ModelUpdate {
  role: ModelRole;
  currentVersion: string;
  availableVersion: string;
  sizeBytes: number;
  /** True when this speaker-model update would invalidate voice profiles. */
  invalidatesVoiceProfiles: boolean;
}

export interface ModelDownloadProgress {
  role: ModelRole;
  modelName: string;
  state: 'downloading' | 'verifying' | 'done' | 'failed';
  bytesDone: number;
  bytesTotal: number;
  message?: string;
}

export type PermissionKind = 'microphone' | 'meetingAudio';
export type PermissionState = 'notDetermined' | 'granted' | 'denied';

export interface SetupStatus {
  models: ModelInfo[];
  permissions: Record<PermissionKind, PermissionState>;
  locationSet: boolean;
  complete: boolean;
}

// Help

export interface AppInfo {
  name: string;
  version: string;
  buildDate: string;
  copyright: string;
  storageStatement: string;
  /** Empty until models are downloaded, which the About screen shows as unavailable. */
  models: ModelInfo[];
}

export interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  text: string;
}
