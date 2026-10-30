import type { MockBackend } from './mock-backend.ts';

export interface DevTrigger {
  id: string;
  group: string;
  label: string;
  run(backend: MockBackend): void;
}

function warn(backend: MockBackend, kind: 'micSilent' | 'lowDisk', message: string): void {
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
    id: 'import-unsupported',
    group: 'Recordings',
    label: 'Next import is an unsupported file',
    run: (b) => b.arm('importUnsupported'),
  },
  {
    id: 'import-disk-full',
    group: 'Recordings',
    label: 'Next import runs out of disk',
    run: (b) => b.arm('importDiskFull'),
  },
  {
    id: 'picker-cancelled',
    group: 'Recordings',
    label: 'Next file picker is cancelled',
    run: (b) => b.arm('pickerCancelled'),
  },
  {
    id: 'finish-final-pass',
    group: 'Recordings',
    label: 'Finish final pass',
    run: (b) => b.finishFinalPass(),
  },
  {
    id: 'delete-slow',
    group: 'Recordings',
    label: 'Next delete is slow',
    run: (b) => b.arm('deleteSlow'),
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
    id: 'summary-stalls',
    group: 'Summary',
    label: 'Next summary stays generating',
    run: (b) => b.arm('summaryStalls'),
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
