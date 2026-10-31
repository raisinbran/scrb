import {
  WHOLE_COMPUTER_SOURCE_ID,
  type AppInfo,
  type AppSettings,
  type InputDevice,
  type LicenseEntry,
  type MeetingApp,
  type MeetingDetail,
  type MeetingSummaryDoc,
  type ModelInfo,
  type ModelUpdate,
  type VocabularyTerm,
  type VoiceProfile,
} from '@scrb/contracts';

export const DEFAULT_SETTINGS: AppSettings = {
  audio: {
    micDeviceId: null,
    meetingAppId: 'app-teams',
    preset: 'voiceIsolation',
    inputSensitivityDb: 'auto',
    noiseSuppression: 'strong',
    echoCancellation: true,
    automaticGainControl: true,
    advancedVoiceActivity: true,
    bypassSystemInputProcessing: false,
    noAudioWarning: true,
    deviceSuggestions: true,
  },
  transcriptionQuality: 'balanced',
  summaryDefaultLength: 'brief',
  storageLocation: '/Users/example/MeetingScribe',
  autoDelete: { period: 'never', scope: 'audioOnly' },
  location: { country: 'US', usState: 'NY' },
  theme: 'system',
  transcriptFontPx: 15,
};

export const INPUT_DEVICES: InputDevice[] = [
  { id: 'mic-builtin', name: 'Built-in Microphone', isSystemDefault: true, transport: 'builtIn' },
  { id: 'mic-usb', name: 'USB Conference Headset', isSystemDefault: false, transport: 'usb' },
  {
    id: 'mic-bt',
    name: 'Wireless Earbuds (hands-free)',
    isSystemDefault: false,
    transport: 'bluetoothHandsFree',
  },
];

export const MEETING_APPS: MeetingApp[] = [
  { id: 'app-teams', name: 'Microsoft Teams', kind: 'app', isRunning: true },
  { id: 'app-zoom', name: 'Zoom', kind: 'app', isRunning: false },
  { id: 'app-browser', name: 'Web browser', kind: 'browser', isRunning: true },
  {
    id: WHOLE_COMPUTER_SOURCE_ID,
    name: 'Whole computer audio',
    kind: 'wholeComputer',
    isRunning: true,
  },
];

export const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: 'profile-1',
    name: 'Priya Natarajan',
    meetingCount: 14,
    lastHeardAt: '2026-10-27T15:00:00Z',
  },
  { id: 'profile-2', name: 'Tomas Lindgren', meetingCount: 9, lastHeardAt: '2026-10-23T17:30:00Z' },
  { id: 'profile-3', name: null, meetingCount: 2, lastHeardAt: '2026-10-20T14:00:00Z' },
];

export const VOCABULARY_TERMS: VocabularyTerm[] = [
  {
    id: 'term-1',
    term: 'Halden Depot',
    misheard: ['holden depot', 'halted depot'],
    contexts: ['rollout at the Halden Depot'],
    enabled: true,
    history: [{ at: '2026-10-12T16:04:00Z', action: 'created', detail: 'From a correction' }],
  },
  {
    id: 'term-2',
    term: 'Kestrel API',
    misheard: ['castrol api'],
    contexts: ['calls the Kestrel API'],
    enabled: true,
    history: [{ at: '2026-10-14T10:40:00Z', action: 'created', detail: 'From a correction' }],
  },
  {
    id: 'term-3',
    term: 'Q-Track',
    misheard: ['cue track'],
    contexts: [],
    enabled: false,
    history: [
      { at: '2026-09-30T09:12:00Z', action: 'created', detail: 'From a correction' },
      { at: '2026-10-02T11:00:00Z', action: 'disabled', detail: 'Turned off by you' },
    ],
  },
];

const base: Pick<
  MeetingDetail,
  'gaps' | 'speakerCount' | 'origin' | 'status' | 'summaryState' | 'hasAudio'
> = {
  gaps: [],
  hasAudio: true,
  speakerCount: 4,
  origin: 'recorded',
  status: 'ready',
  summaryState: 'notGenerated',
};

export const LONG_MEETING_ID = 'meeting-8h';

export function createLibrary(): MeetingDetail[] {
  return [
    {
      ...base,
      id: LONG_MEETING_ID,
      title: 'Depot rollout planning workshop',
      startedAt: '2026-10-28T13:00:00Z',
      durationMs: 8 * 3_600_000,
      summaryState: 'ready',
      speakerCount: 4,
    },
    {
      ...base,
      id: 'meeting-outdated',
      title: 'Weekly project sync',
      startedAt: '2026-10-27T15:00:00Z',
      durationMs: 47 * 60_000,
      summaryState: 'outdated',
      gaps: [{ kind: 'paused', track: 'both', startMs: 900_000, endMs: 1_020_000 }],
    },
    {
      ...base,
      id: 'meeting-edited',
      title: 'Design review',
      startedAt: '2026-10-24T14:00:00Z',
      durationMs: 38 * 60_000,
      summaryState: 'edited',
      speakerCount: 3,
    },
    {
      ...base,
      id: 'meeting-recovered',
      title: 'Vendor call',
      startedAt: '2026-10-26T18:00:00Z',
      durationMs: 31 * 60_000,
      status: 'recovered',
      recoveredEndMs: 31 * 60_000,
    },
    {
      ...base,
      id: 'meeting-imported',
      title: 'Imported interview recording',
      startedAt: '2026-10-22T09:30:00Z',
      durationMs: 26 * 60_000,
      origin: 'imported',
      speakerCount: 2,
    },
    {
      ...base,
      id: 'meeting-final-pass',
      title: 'Budget review',
      startedAt: '2026-10-29T16:00:00Z',
      durationMs: 58 * 60_000,
      status: 'finalPassRunning',
    },
  ];
}

const UNREVIEWED = { alsoAtMs: [], needsReview: false, edited: false };

export function createSummary(
  meetingId: string,
  state: MeetingSummaryDoc['state'],
): MeetingSummaryDoc {
  const empty = state === 'notGenerated';
  return {
    meetingId,
    state,
    generatedAt: empty ? null : '2026-10-28T22:10:00Z',
    narrative: {
      brief: empty
        ? null
        : [
            {
              id: 'n-b1',
              heading: null,
              text: 'The team agreed to start the pilot at the northern depot in the second week of November. Storage costs still need an updated estimate, and the older inventory records remain the main risk.',
              edited: state === 'edited',
            },
          ],
      full: empty
        ? null
        : [
            {
              id: 'n-f1',
              heading: 'Overview',
              text: 'The session covered the pilot rollout, vendor timing and how to migrate older inventory records.',
              edited: false,
            },
            {
              id: 'n-f2',
              heading: 'Main topics',
              text: 'Delivery moves to the second week if integration testing finishes first. The manual process stays in parallel for a month.',
              edited: false,
            },
          ],
    },
    actionItems: empty
      ? []
      : [
          {
            id: 'a-1',
            action: 'Send updated storage cost estimate',
            owner: 'Priya Natarajan',
            deadline: 'Friday',
            ownerUnconfirmed: false,
            deadlineUnconfirmed: false,
            status: 'agreed',
            sourceMs: 412_000,
            ...UNREVIEWED,
            edited: state === 'edited',
          },
          {
            id: 'a-2',
            action: 'Check budget approval with finance',
            owner: null,
            deadline: null,
            ownerUnconfirmed: true,
            deadlineUnconfirmed: false,
            status: 'unconfirmed',
            sourceMs: 1_840_000,
            ...UNREVIEWED,
          },
          {
            id: 'a-3',
            action: 'Book the first training session',
            owner: 'Tomas Lindgren',
            deadline: 'next week',
            ownerUnconfirmed: false,
            deadlineUnconfirmed: true,
            status: 'proposed',
            sourceMs: 2_600_000,
            ...UNREVIEWED,
            alsoAtMs: [2_710_000],
            needsReview: true,
          },
        ],
    decisions: empty
      ? []
      : [
          {
            id: 'd-1',
            decision: 'Keep the manual process in parallel for one month',
            status: 'decided',
            impactArea: 'risk',
            sourceMs: 905_000,
            ...UNREVIEWED,
          },
          {
            id: 'd-2',
            decision: 'Move the review to Thursday morning',
            status: 'tentativelyAgreed',
            impactArea: 'schedule',
            sourceMs: 2_210_000,
            ...UNREVIEWED,
          },
        ],
    openQuestions: empty
      ? []
      : [
          {
            id: 'q-1',
            question: 'Who owns the on-call rota after launch?',
            sourceMs: 3_300_000,
            ...UNREVIEWED,
          },
        ],
    warnings:
      state === 'outdated' ? ['15:00 to 17:00 was paused, so the summary does not cover it.'] : [],
  };
}

export const MODELS: ModelInfo[] = [
  {
    role: 'liveSpeech',
    name: 'whisper small (quantized)',
    version: 'mock-1',
    installed: true,
    sizeBytes: 190_000_000,
  },
  {
    role: 'finalSpeech',
    name: 'whisper large-v3-turbo (quantized)',
    version: 'mock-1',
    installed: true,
    sizeBytes: 570_000_000,
  },
  {
    role: 'speaker',
    name: 'speaker embedding',
    version: 'mock-1',
    installed: true,
    sizeBytes: 40_000_000,
  },
  {
    role: 'summary',
    name: 'summary 8B (4-bit)',
    version: 'mock-1',
    installed: true,
    sizeBytes: 5_000_000_000,
  },
];

export const MODEL_UPDATES: ModelUpdate[] = [
  {
    role: 'finalSpeech',
    currentVersion: 'mock-1',
    availableVersion: 'mock-2',
    sizeBytes: 590_000_000,
    invalidatesVoiceProfiles: false,
  },
];

export const APP_INFO: AppInfo = {
  name: 'Meeting Scribe',
  version: '0.1.0 (mock backend)',
  buildDate: '2026-10-30',
  copyright: '© 2026 BJC, all rights reserved; personal use only',
  storageStatement: 'Recordings, transcripts and voice profiles stay on this computer.',
  models: MODELS,
};

export const LICENSES: LicenseEntry[] = [
  {
    name: 'Electron',
    version: '45.1.0',
    license: 'MIT',
    text: 'Placeholder: real notices come from THIRD_PARTY_NOTICES.md.',
  },
  {
    name: 'React',
    version: '19.3.1',
    license: 'MIT',
    text: 'Placeholder: real notices come from THIRD_PARTY_NOTICES.md.',
  },
];
