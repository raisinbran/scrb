/**
 * The typed UI/backend contract: every call and event the UI may use.
 *
 * DRAFT: awaiting owner approval.
 *
 * Entries tagged `@addition` are not in the UI Specification's contract table. They are proposed
 * because a listed screen cannot work without them; `README.md` gives the reason for each.
 */

import type {
  AppInfo,
  AppSettings,
  DeleteResult,
  DeviceChange,
  ExportFinished,
  ExportId,
  ExportRequest,
  ImportFailed,
  ImportFinished,
  ImportId,
  ImportProgress,
  InputDevice,
  LevelMeter,
  LicenseEntry,
  MeetingApp,
  MeetingDetail,
  MeetingFilter,
  MeetingFolder,
  MeetingId,
  MeetingListItem,
  MeetingSummaryDoc,
  ModelDownloadProgress,
  ModelRole,
  ModelUpdate,
  PermissionKind,
  PermissionState,
  PickedAudioFile,
  PlaybackPosition,
  ProfileId,
  RecordingHealth,
  RecordingState,
  SearchResult,
  SettingsPatch,
  SetupStatus,
  SourceSelection,
  SpeakerId,
  SpeakerMerge,
  SpeakerSuggestion,
  SpeakerTarget,
  SummaryItemUpdate,
  SummaryLength,
  SummaryProgress,
  TermId,
  TranscriptChanged,
  TranscriptPage,
  TranscriptionLag,
  UndoState,
  VocabularyTerm,
  VocabularyTermPatch,
  VoiceProfile,
  WordRange,
} from './types.ts';

/** Maps each call name to its request and response. */
export interface BackendCalls {
  // Session
  startRecording: { request: { title?: string }; response: { meetingId: MeetingId } };
  pauseRecording: { request: void; response: void };
  resumeRecording: { request: void; response: void };
  stopRecording: { request: void; response: void };
  /** @addition */
  getRecordingState: { request: void; response: RecordingState };

  // Import
  /** @addition */
  pickAudioFile: { request: void; response: PickedAudioFile | null };
  importAudioFile: {
    request: { fileToken: string; buildVoiceProfiles: boolean };
    response: { importId: ImportId };
  };
  cancelImport: { request: { importId: ImportId }; response: void };

  // Devices
  listInputDevices: { request: void; response: InputDevice[] };
  listMeetingApps: { request: void; response: MeetingApp[] };
  selectSources: { request: SourceSelection; response: void };

  // Transcript
  /** @addition */
  getTranscript: {
    request: { meetingId: MeetingId; offset: number; limit: number };
    response: TranscriptPage;
  };
  applyCorrection: {
    request: { meetingId: MeetingId; range: WordRange; text: string; remember: boolean };
    response: UndoState;
  };
  reassignSpeaker: {
    request: { meetingId: MeetingId; range: WordRange; speakerId: SpeakerId };
    response: UndoState;
  };
  undo: { request: { meetingId: MeetingId }; response: UndoState };
  redo: { request: { meetingId: MeetingId }; response: UndoState };
  seekAudio: { request: { meetingId: MeetingId; positionMs: number }; response: void };
  /** @addition */
  pauseAudio: { request: { meetingId: MeetingId }; response: void };

  // Speakers
  /** @addition */
  listProfiles: { request: void; response: VoiceProfile[] };
  renameSpeaker: { request: { target: SpeakerTarget; name: string }; response: void };
  mergeSpeakers: { request: SpeakerMerge; response: void };
  /** @addition */
  splitSpeaker: {
    request: { meetingId: MeetingId; range: WordRange; newLabel: string };
    response: { speakerId: SpeakerId };
  };
  deleteProfile: { request: { profileId: ProfileId }; response: void };
  /** @addition */
  answerSpeakerSuggestion: {
    request: {
      meetingId: MeetingId;
      speakerId: SpeakerId;
      profileId: ProfileId;
      accepted: boolean;
    };
    response: void;
  };

  // Vocabulary
  listTerms: { request: void; response: VocabularyTerm[] };
  updateTerm: { request: { id: TermId; patch: VocabularyTermPatch }; response: VocabularyTerm };
  deleteTerm: { request: { id: TermId }; response: void };

  // Summary
  /** @addition */
  getSummary: { request: { meetingId: MeetingId }; response: MeetingSummaryDoc };
  generateSummary: { request: { meetingId: MeetingId; length: SummaryLength }; response: void };
  updateSummaryItem: {
    request: { meetingId: MeetingId; update: SummaryItemUpdate };
    response: MeetingSummaryDoc;
  };

  // Library
  listMeetings: { request: { filter?: MeetingFilter }; response: MeetingListItem[] };
  /** @addition */
  getMeeting: { request: { meetingId: MeetingId }; response: MeetingDetail };
  /** @addition */
  updateMeeting: {
    request: { meetingId: MeetingId; title?: string; startedAt?: string };
    response: MeetingDetail;
  };
  searchMeetings: { request: { query: string }; response: SearchResult[] };
  deleteMeeting: { request: { meetingId: MeetingId }; response: DeleteResult };
  openMeetingFolder: { request: { meetingId: MeetingId; folder: MeetingFolder }; response: void };
  exportMeeting: { request: ExportRequest; response: { exportId: ExportId } };

  // Settings
  getSettings: { request: void; response: AppSettings };
  updateSettings: { request: SettingsPatch; response: AppSettings };
  /** @addition */
  pickStorageLocation: { request: void; response: AppSettings };
  checkModelUpdates: { request: void; response: ModelUpdate[] };
  /** @addition */
  installModelUpdate: { request: { role: ModelRole }; response: void };
  revertModel: { request: { role: ModelRole }; response: void };

  // Setup
  /** @addition */
  getSetupStatus: { request: void; response: SetupStatus };
  /** @addition */
  startModelDownload: { request: void; response: void };
  /** @addition */
  requestPermission: { request: { permission: PermissionKind }; response: PermissionState };

  // Help
  getAppInfo: { request: void; response: AppInfo };
  getLicenses: { request: void; response: LicenseEntry[] };
  openLogsFolder: { request: void; response: void };
}

/** Maps each event name to its payload. */
export interface BackendEvents {
  // Session
  recordingStateChanged: RecordingState;
  recordingHealth: RecordingHealth;

  // Import
  importProgress: ImportProgress;
  importFinished: ImportFinished;
  importFailed: ImportFailed;

  // Devices
  deviceChanged: DeviceChange;
  levelMeter: LevelMeter;

  // Transcript
  transcriptChanged: TranscriptChanged;
  transcriptionLag: TranscriptionLag;
  /** @addition */
  playbackPosition: PlaybackPosition;

  // Speakers
  speakerSuggestion: SpeakerSuggestion;

  // Summary
  summaryProgress: SummaryProgress;
  summaryOutdated: { meetingId: MeetingId };

  // Library
  exportFinished: ExportFinished;

  // Settings
  modelDownloadProgress: ModelDownloadProgress;
}

export type CallName = keyof BackendCalls;
export type EventName = keyof BackendEvents;
export type CallRequest<K extends CallName> = BackendCalls[K]['request'];
export type CallResponse<K extends CallName> = BackendCalls[K]['response'];

export type ContractErrorCode =
  | 'notImplemented'
  | 'invalidRequest'
  | 'notFound'
  | 'conflict'
  | 'permissionDenied'
  | 'diskFull'
  | 'internal';

export interface ContractErrorInfo {
  code: ContractErrorCode;
  /** Plain-language text that is safe to show the user. */
  message: string;
}

/** Thrown by `Backend.call`. Errors cross IPC as data, so `code` survives the process boundary. */
export class ContractError extends Error {
  readonly code: ContractErrorCode;

  constructor({ code, message }: ContractErrorInfo) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}

export type Unsubscribe = () => void;

/** The only surface the UI uses. The Electron bridge and the mock both implement it. */
export interface Backend {
  call<K extends CallName>(
    name: K,
    ...args: CallRequest<K> extends void ? [] : [request: CallRequest<K>]
  ): Promise<CallResponse<K>>;
  on<K extends EventName>(name: K, listener: (payload: BackendEvents[K]) => void): Unsubscribe;
}

/** What a call becomes on the wire between the preload script and the main process. */
export type CallEnvelope<T = unknown> =
  { ok: true; value: T } | { ok: false; error: ContractErrorInfo };

/** The object the preload script exposes on `window.scribeBridge`. */
export interface ScribeBridge {
  readonly platform: string;
  invoke(name: CallName, request: unknown): Promise<CallEnvelope>;
  subscribe(name: EventName, listener: (payload: unknown) => void): Unsubscribe;
}

// Written as records so the compiler rejects a call or event that is missing here. The preload
// script and the main process allow exactly these names.
const CALL_TABLE: Record<CallName, true> = {
  startRecording: true,
  pauseRecording: true,
  resumeRecording: true,
  stopRecording: true,
  getRecordingState: true,
  pickAudioFile: true,
  importAudioFile: true,
  cancelImport: true,
  listInputDevices: true,
  listMeetingApps: true,
  selectSources: true,
  getTranscript: true,
  applyCorrection: true,
  reassignSpeaker: true,
  undo: true,
  redo: true,
  seekAudio: true,
  pauseAudio: true,
  listProfiles: true,
  renameSpeaker: true,
  mergeSpeakers: true,
  splitSpeaker: true,
  deleteProfile: true,
  answerSpeakerSuggestion: true,
  listTerms: true,
  updateTerm: true,
  deleteTerm: true,
  getSummary: true,
  generateSummary: true,
  updateSummaryItem: true,
  listMeetings: true,
  getMeeting: true,
  updateMeeting: true,
  searchMeetings: true,
  deleteMeeting: true,
  openMeetingFolder: true,
  exportMeeting: true,
  getSettings: true,
  updateSettings: true,
  pickStorageLocation: true,
  checkModelUpdates: true,
  installModelUpdate: true,
  revertModel: true,
  getSetupStatus: true,
  startModelDownload: true,
  requestPermission: true,
  getAppInfo: true,
  getLicenses: true,
  openLogsFolder: true,
};

const EVENT_TABLE: Record<EventName, true> = {
  recordingStateChanged: true,
  recordingHealth: true,
  importProgress: true,
  importFinished: true,
  importFailed: true,
  deviceChanged: true,
  levelMeter: true,
  transcriptChanged: true,
  transcriptionLag: true,
  playbackPosition: true,
  speakerSuggestion: true,
  summaryProgress: true,
  summaryOutdated: true,
  exportFinished: true,
  modelDownloadProgress: true,
};

export const CALL_NAMES = Object.keys(CALL_TABLE) as CallName[];
export const EVENT_NAMES = Object.keys(EVENT_TABLE) as EventName[];

export const IPC_CALL_CHANNEL = 'scrb:call';
export const IPC_EVENT_CHANNEL = 'scrb:event';
