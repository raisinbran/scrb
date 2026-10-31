/**
 * Runtime checks for every call's request. Types vanish at the process boundary, so a compromised
 * or buggy renderer can send anything; the main process refuses what does not pass here.
 */

import type { BackendCalls, CallName, CallRequest } from './backend.ts';

/** The most segments one `getTranscript` call may ask for. */
export const MAX_TRANSCRIPT_PAGE = 2000;

const MAX_ID = 128;
const MAX_DEVICE_ID = 512;
const MAX_NAME = 300;
const MAX_TEXT = 20_000;
const MAX_LIST = 1000;
const MAX_MS = 7 * 24 * 60 * 60 * 1000;

type Check<T> = (value: unknown) => value is T;

const ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const text =
  (max: number): Check<string> =>
  (value): value is string =>
    typeof value === 'string' && value.length <= max;

const filled =
  (max: number): Check<string> =>
  (value): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= max;

const id: Check<string> = (value): value is string =>
  filled(MAX_ID)(value) && ID_PATTERN.test(value);

const date: Check<string> = (value): value is string =>
  filled(40)(value) && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));

const int =
  (min: number, max: number): Check<number> =>
  (value): value is number =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

const ms = int(0, MAX_MS);

const flag: Check<boolean> = (value): value is boolean => typeof value === 'boolean';

const nothing: Check<void> = (value): value is void => value === undefined || value === null;

function oneOf<const T extends string>(...choices: readonly T[]): Check<T> {
  return (value): value is T => choices.includes(value as T);
}

const orNull =
  <T>(check: Check<T>): Check<T | null> =>
  (value): value is T | null =>
    value === null || check(value);

const list =
  <T>(check: Check<T>): Check<T[]> =>
  (value): value is T[] =>
    Array.isArray(value) && value.length <= MAX_LIST && value.every(check);

type Shape = Record<string, Check<unknown>>;
type Checked<S extends Shape> = { [K in keyof S]: S[K] extends Check<infer T> ? T : never };

/** An object with exactly these keys, plus any of `optional`. Unknown keys are refused. */
function shape<R extends Shape, O extends Shape = Record<never, never>>(
  required: R,
  optional?: O,
): Check<Checked<R> & Partial<Checked<O>>> {
  return (value): value is Checked<R> & Partial<Checked<O>> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const allowed = { ...required, ...optional } as Shape;
    if (Object.keys(record).some((key) => !Object.hasOwn(allowed, key))) return false;
    for (const key of Object.keys(required)) {
      if (!Object.hasOwn(record, key) || !required[key]?.(record[key])) return false;
    }
    return Object.keys(record).every((key) => allowed[key]?.(record[key]));
  };
}

const either =
  <A, B>(a: Check<A>, b: Check<B>): Check<A | B> =>
  (value): value is A | B =>
    a(value) || b(value);

const meeting = shape({ meetingId: id });
const wordRange = shape({ firstWordId: id, lastWordId: id });
const modelRole = oneOf('liveSpeech', 'finalSpeech', 'speaker', 'summary');

const evidence = {
  alsoAtMs: list(ms),
  needsReview: flag,
  edited: flag,
};

const summaryUpdate = either(
  either(
    shape({
      kind: oneOf('narrative'),
      item: shape({ id, heading: orNull(text(MAX_NAME)), text: text(MAX_TEXT), edited: flag }),
    }),
    shape({
      kind: oneOf('actionItem'),
      item: shape({
        id,
        action: text(MAX_TEXT),
        owner: orNull(text(MAX_NAME)),
        ownerUnconfirmed: flag,
        deadline: orNull(text(MAX_NAME)),
        deadlineUnconfirmed: flag,
        status: oneOf('agreed', 'proposed', 'unconfirmed'),
        sourceMs: ms,
        ...evidence,
      }),
    }),
  ),
  either(
    shape({
      kind: oneOf('decision'),
      item: shape({
        id,
        decision: text(MAX_TEXT),
        status: oneOf('decided', 'proposed', 'tentativelyAgreed', 'unresolved'),
        impactArea: orNull(
          oneOf('scope', 'schedule', 'cost', 'risk', 'deliverables', 'technicalApproach'),
        ),
        sourceMs: ms,
        ...evidence,
      }),
    }),
    shape({
      kind: oneOf('openQuestion'),
      item: shape({ id, question: text(MAX_TEXT), sourceMs: orNull(ms), ...evidence }),
    }),
  ),
);

const sourceSelection = shape({
  micDeviceId: orNull(text(MAX_DEVICE_ID)),
  meetingAppId: filled(MAX_DEVICE_ID),
});

const audioSettings = shape(
  {},
  {
    micDeviceId: orNull(text(MAX_DEVICE_ID)),
    meetingAppId: filled(MAX_DEVICE_ID),
    preset: oneOf('voiceIsolation', 'studio', 'custom'),
    inputSensitivityDb: either(oneOf('auto'), int(-100, 0)),
    noiseSuppression: oneOf('off', 'standard', 'strong'),
    echoCancellation: flag,
    automaticGainControl: flag,
    advancedVoiceActivity: flag,
    bypassSystemInputProcessing: flag,
    noAudioWarning: flag,
    deviceSuggestions: flag,
  },
);

const settingsPatch = shape(
  {},
  {
    audio: audioSettings,
    transcriptionQuality: oneOf('fast', 'balanced', 'accurate'),
    summaryDefaultLength: oneOf('brief', 'full'),
    storageLocation: filled(4096),
    autoDelete: shape(
      {},
      {
        period: oneOf('30d', '90d', '180d', '1y', 'never'),
        scope: oneOf('audioOnly', 'wholeMeeting'),
      },
    ),
    location: shape({}, { country: orNull(filled(2)), usState: orNull(filled(2)) }),
    theme: oneOf('light', 'dark', 'system'),
    transcriptFontPx: int(8, 72),
  },
);

const exportRequest = shape({
  meetingId: id,
  content: oneOf('transcript', 'summary', 'both'),
  format: oneOf('docx', 'pdf'),
  transcript: shape({
    title: flag,
    date: flag,
    duration: flag,
    speakerNames: flag,
    timestamps: flag,
    showCorrections: flag,
  }),
  summary: shape({
    length: oneOf('brief', 'full'),
    openQuestions: flag,
    sourceTimestamps: flag,
  }),
});

const REQUEST_CHECKS: { [K in CallName]: Check<CallRequest<K>> } = {
  startRecording: shape({}, { title: text(MAX_NAME) }),
  pauseRecording: nothing,
  resumeRecording: nothing,
  stopRecording: nothing,
  getRecordingSnapshot: nothing,

  pickAudioFile: nothing,
  importAudioFile: shape({ fileToken: id, buildVoiceProfiles: flag }),
  cancelImport: shape({ importId: id }),

  listInputDevices: nothing,
  listMeetingApps: nothing,
  selectSources: sourceSelection,
  startAudioCheck: shape({ sources: sourceSelection }),
  stopAudioCheck: nothing,

  getTranscript: shape({
    meetingId: id,
    offset: int(0, Number.MAX_SAFE_INTEGER),
    limit: int(1, MAX_TRANSCRIPT_PAGE),
  }),
  getUndoState: meeting,
  applyCorrection: shape({ meetingId: id, range: wordRange, text: text(MAX_TEXT), remember: flag }),
  reassignSpeaker: shape({ meetingId: id, range: wordRange, speakerId: id }),
  undo: meeting,
  redo: meeting,
  seekAudio: shape({ meetingId: id, positionMs: ms }),
  pauseAudio: meeting,

  listProfiles: nothing,
  renameSpeaker: shape({
    target: either(
      shape({ kind: oneOf('meetingSpeaker'), meetingId: id, speakerId: id }),
      shape({ kind: oneOf('profile'), profileId: id }),
    ),
    name: filled(MAX_NAME),
  }),
  mergeSpeakers: either(
    shape({ kind: oneOf('meetingSpeakers'), meetingId: id, from: id, into: id }),
    shape({ kind: oneOf('profiles'), from: id, into: id }),
  ),
  splitSpeaker: shape({ meetingId: id, range: wordRange, newLabel: filled(MAX_NAME) }),
  deleteProfile: shape({ profileId: id }),
  answerSpeakerSuggestion: shape({ meetingId: id, speakerId: id, profileId: id, accepted: flag }),

  listTerms: nothing,
  updateTerm: shape({
    id,
    patch: shape({}, { term: filled(MAX_NAME), misheard: list(filled(MAX_NAME)), enabled: flag }),
  }),
  deleteTerm: shape({ id }),

  getSummary: meeting,
  generateSummary: shape({ meetingId: id, length: oneOf('brief', 'full') }),
  updateSummaryItem: shape({ meetingId: id, update: summaryUpdate }),

  listMeetings: shape(
    {},
    {
      filter: shape({}, { origin: oneOf('recorded', 'imported'), from: date, to: date }),
    },
  ),
  getMeeting: meeting,
  retryFinalPass: meeting,
  updateMeeting: shape({ meetingId: id }, { title: filled(MAX_NAME), startedAt: date }),
  searchMeetings: shape({ query: text(MAX_NAME) }),
  deleteMeeting: meeting,
  openMeetingFolder: shape({ meetingId: id, folder: oneOf('meeting', 'audio', 'exports') }),
  exportMeeting: exportRequest,

  getSettings: nothing,
  updateSettings: settingsPatch,
  pickStorageLocation: nothing,
  checkModelUpdates: nothing,
  installModelUpdate: shape({ role: modelRole }),
  revertModel: shape({ role: modelRole }),

  getSetupStatus: nothing,
  startModelDownload: nothing,
  requestPermission: shape({ permission: oneOf('microphone', 'meetingAudio') }),

  getAppInfo: nothing,
  getLicenses: nothing,
  openLogsFolder: nothing,
};

export function isValidRequest<K extends CallName>(
  name: K,
  request: unknown,
): request is BackendCalls[K]['request'] {
  return REQUEST_CHECKS[name](request);
}
