import type { RecordingWarningKind } from '@scrb/contracts';
import type { MockBackend } from './mock-backend.ts';

export interface DevTrigger {
  id: string;
  group: string;
  label: string;
  run(backend: MockBackend): void;
}

function warn(backend: MockBackend, kind: RecordingWarningKind, message: string): void {
  backend.emit('recordingHealth', {
    level: 'warning',
    warnings: [{ kind, message, atMs: 0 }],
    diskFreeBytes: kind === 'lowDisk' ? 900_000_000 : 180_000_000_000,
  });
}

/** One entry for every error or special state in the UI Specification's Screens table. */
export const DEV_TRIGGERS: DevTrigger[] = [
  {
    id: 'start',
    group: 'Live',
    label: 'Start scripted meeting',
    run: (b) => void b.call('startRecording', {}),
  },
  { id: 'stop', group: 'Live', label: 'Stop meeting', run: (b) => void b.call('stopRecording') },
  {
    id: 'start-8-hours',
    group: 'Live',
    label: 'Start 8-hour live meeting',
    run: (b) => b.startLongLiveMeeting(),
  },
  {
    id: 'start-denied',
    group: 'Live',
    label: 'Next start is denied',
    run: (b) => b.arm('startDenied'),
  },
  {
    id: 'lagging',
    group: 'Live',
    label: 'Transcription lagging',
    run: (b) => b.emit('transcriptionLag', { status: 'lagging', lagMs: 14_000 }),
  },
  {
    id: 'transcription-failed',
    group: 'Live',
    label: 'Transcription failed',
    run: (b) => b.emit('transcriptionLag', { status: 'failed', lagMs: 0 }),
  },
  {
    id: 'transcription-restarting',
    group: 'Live',
    label: 'Transcription restarting',
    run: (b) => b.emit('transcriptionLag', { status: 'restarting', lagMs: 0 }),
  },
  {
    id: 'transcription-ok',
    group: 'Live',
    label: 'Transcription back to normal',
    run: (b) => b.emit('transcriptionLag', { status: 'ok', lagMs: 1200 }),
  },
  {
    id: 'mic-silent',
    group: 'Live',
    label: 'Mic silent',
    run: (b) => warn(b, 'micSilent', 'No sound from your microphone.'),
  },
  {
    id: 'low-disk',
    group: 'Live',
    label: 'Low disk',
    run: (b) => warn(b, 'lowDisk', 'Less than 1 GB of disk space left.'),
  },
  {
    id: 'permission-lost',
    group: 'Live',
    label: 'Permission lost',
    run: (b) => warn(b, 'permissionLost', 'Microphone permission was turned off.'),
  },
  {
    id: 'audio-missing',
    group: 'Live',
    label: 'Audio missing',
    run: (b) => warn(b, 'audioMissing', 'No meeting audio for the last 2 minutes.'),
  },
  {
    id: 'bluetooth-mic',
    group: 'Live',
    label: 'Bluetooth hands-free mic',
    run: (b) =>
      warn(b, 'bluetoothHandsFreeMic', 'This Bluetooth mic is in low-quality hands-free mode.'),
  },
  {
    id: 'recording-failed',
    group: 'Live',
    label: 'Recording failed',
    run: (b) =>
      b.emit('recordingHealth', {
        level: 'failed',
        warnings: [{ kind: 'lowDisk', message: 'The disk is full. Recording stopped.', atMs: 0 }],
        diskFreeBytes: 0,
      }),
  },
  {
    id: 'health-ok',
    group: 'Live',
    label: 'Clear recording warnings',
    run: (b) =>
      b.emit('recordingHealth', { level: 'ok', warnings: [], diskFreeBytes: 180_000_000_000 }),
  },
  {
    id: 'mic-removed',
    group: 'Live',
    label: 'Selected mic removed',
    run: (b) =>
      b.emit('deviceChanged', {
        kind: 'removed',
        device: {
          id: 'mic-usb',
          name: 'USB Conference Headset',
          isSystemDefault: false,
          transport: 'usb',
        },
        fallbackDevice: {
          id: 'mic-builtin',
          name: 'Built-in Microphone',
          isSystemDefault: true,
          transport: 'builtIn',
        },
        suggestSwitch: false,
      }),
  },
  {
    id: 'device-changed',
    group: 'Live',
    label: 'Device changed',
    run: (b) =>
      b.emit('deviceChanged', {
        kind: 'added',
        device: {
          id: 'mic-usb',
          name: 'USB Conference Headset',
          isSystemDefault: false,
          transport: 'usb',
        },
        suggestSwitch: true,
      }),
  },
  {
    id: 'empty-library',
    group: 'Recordings',
    label: 'Empty library',
    run: (b) => b.setLibrary([]),
  },
  {
    id: 'reset-library',
    group: 'Recordings',
    label: 'Restore sample library',
    run: (b) => b.reset(),
  },
  {
    id: 'import-fails',
    group: 'Recordings',
    label: 'Next import fails',
    run: (b) => b.arm('importFails'),
  },
  {
    id: 'delete-fails',
    group: 'Recordings',
    label: 'Next delete leaves files behind',
    run: (b) => b.arm('deleteFails'),
  },
  {
    id: 'export-fails',
    group: 'Recordings',
    label: 'Next export fails',
    run: (b) => b.arm('exportFails'),
  },
  {
    id: 'summary-fails',
    group: 'Summary',
    label: 'Next summary fails',
    run: (b) => b.arm('summaryFails'),
  },
  {
    id: 'summary-outdated',
    group: 'Summary',
    label: 'Mark summary outdated',
    run: (b) => b.emit('summaryOutdated', { meetingId: 'meeting-8h' }),
  },
  {
    id: 'speaker-suggestion',
    group: 'Speakers',
    label: 'Suggested match',
    run: (b) =>
      b.emit('speakerSuggestion', {
        meetingId: 'meeting-8h',
        speakerId: 'sp-3',
        profileId: 'profile-2',
        profileName: 'Tomas Lindgren',
      }),
  },
  {
    id: 'models-missing',
    group: 'Setup',
    label: 'Models not downloaded',
    run: (b) => b.arm('modelsMissing'),
  },
  {
    id: 'download-fails',
    group: 'Setup',
    label: 'Next model download fails',
    run: (b) => b.arm('modelDownloadFails'),
  },
  {
    id: 'permission-denied',
    group: 'Setup',
    label: 'Permission denied',
    run: (b) => b.arm('permissionDenied'),
  },
  {
    id: 'no-model-info',
    group: 'Help',
    label: 'Model info unavailable',
    run: (b) => b.arm('noModelInfo'),
  },
];
