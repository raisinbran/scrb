import type { AppSettings, SetupStatus } from '@scrb/contracts';

/**
 * Real-mode setup status. Only the location answer is known: packaging does not ship models or
 * report permissions yet, so the lists stay empty and permissions stay unknown instead of
 * showing the mock's invented "installed" models.
 */
export function createSetupStatusHandler(readSettings: () => AppSettings) {
  return async (): Promise<SetupStatus> => ({
    models: [],
    permissions: { microphone: 'unknown', meetingAudio: 'unknown' },
    locationSet: readSettings().location.country !== null,
    complete: false,
  });
}
