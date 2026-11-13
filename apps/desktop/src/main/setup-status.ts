import type { AppSettings, SetupStatus } from '@scrb/contracts';
import type { PackagedSetup } from './packaged-setup.ts';

/**
 * Real-mode setup status. Models come from the packaged check when there is one; permissions stay
 * unknown, and the mock's invented "installed" models are never shown.
 */
export function createSetupStatusHandler(
  readSettings: () => AppSettings,
  packaged: Pick<PackagedSetup, 'models'> | null = null,
) {
  return async (): Promise<SetupStatus> => ({
    models: packaged?.models ?? [],
    permissions: { microphone: 'unknown', meetingAudio: 'unknown' },
    locationSet: readSettings().location.country !== null,
    complete: false,
  });
}
