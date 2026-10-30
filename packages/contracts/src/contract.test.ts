import { describe, expect, it } from 'vitest';
import { CALL_NAMES, ContractError, EVENT_NAMES, createBridgeBackend } from './index.ts';
import type { ScribeBridge } from './index.ts';

// The UI Specification's contract table, copied by hand so a rename shows up as a failure.
const SPEC_CALLS = [
  'startRecording',
  'pauseRecording',
  'resumeRecording',
  'stopRecording',
  'importAudioFile',
  'cancelImport',
  'listInputDevices',
  'listMeetingApps',
  'selectSources',
  'applyCorrection',
  'reassignSpeaker',
  'undo',
  'redo',
  'seekAudio',
  'renameSpeaker',
  'mergeSpeakers',
  'deleteProfile',
  'listTerms',
  'updateTerm',
  'deleteTerm',
  'generateSummary',
  'updateSummaryItem',
  'listMeetings',
  'searchMeetings',
  'deleteMeeting',
  'openMeetingFolder',
  'exportMeeting',
  'getSettings',
  'updateSettings',
  'checkModelUpdates',
  'revertModel',
  'getAppInfo',
  'getLicenses',
  'openLogsFolder',
];

const SPEC_EVENTS = [
  'recordingStateChanged',
  'recordingHealth',
  'importProgress',
  'importFinished',
  'importFailed',
  'deviceChanged',
  'levelMeter',
  'transcriptChanged',
  'transcriptionLag',
  'speakerSuggestion',
  'summaryProgress',
  'summaryOutdated',
  'exportFinished',
  'modelDownloadProgress',
];

describe('contract names', () => {
  it('covers every call and event in the UI Specification table', () => {
    expect(CALL_NAMES).toEqual(expect.arrayContaining(SPEC_CALLS));
    expect(EVENT_NAMES).toEqual(expect.arrayContaining(SPEC_EVENTS));
  });
});

describe('createBridgeBackend', () => {
  const bridge = (envelope: Awaited<ReturnType<ScribeBridge['invoke']>>): ScribeBridge => ({
    platform: 'test',
    invoke: async () => envelope,
    subscribe: () => () => undefined,
  });

  it('returns the value of a successful envelope', async () => {
    const backend = createBridgeBackend(bridge({ ok: true, value: [] }));
    await expect(backend.call('listTerms')).resolves.toEqual([]);
  });

  it('keeps the error code across the process boundary', async () => {
    const backend = createBridgeBackend(
      bridge({ ok: false, error: { code: 'notFound', message: 'No such meeting.' } }),
    );
    const failure = await backend.call('getAppInfo').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ContractError);
    expect((failure as ContractError).code).toBe('notFound');
  });
});
