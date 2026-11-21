import { describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@scrb/contracts';
import { ensureSyntheticDevelopmentLocation } from './synthetic-location.ts';

function settingsStore(location: AppSettings['location'] = { country: null, usState: null }) {
  const settings = {
    getSettings: () => ({ location }) as AppSettings,
    updateSettings: vi.fn((patch: { location: AppSettings['location'] }) => {
      location = patch.location;
      return { location } as AppSettings;
    }),
  };
  return { settings };
}

describe('synthetic development location', () => {
  const isolatedProfile = {
    enabled: true,
    packaged: false,
    explicitUserData: true,
    explicitLibrary: true,
    userData: 'C:\\Users\\tester\\AppData\\Local\\Temp\\scribe-test\\profile',
    libraryRoot: 'C:\\Users\\tester\\AppData\\Local\\Temp\\scribe-test\\library',
    tempRoot: 'C:\\Users\\tester\\AppData\\Local\\Temp',
    appData: 'C:\\Users\\tester\\AppData\\Roaming',
    appName: 'Scribe',
    platform: 'win32' as const,
  };

  it('persists a random fictional state once and reuses the saved choice', () => {
    const { settings } = settingsStore();
    expect(ensureSyntheticDevelopmentLocation(settings, isolatedProfile, () => 15)).toBe('KS');
    expect(settings.updateSettings).toHaveBeenCalledTimes(1);
    expect(settings.updateSettings).toHaveBeenCalledWith({
      location: { country: 'US', usState: 'KS' },
    });

    expect(ensureSyntheticDevelopmentLocation(settings, isolatedProfile, () => 0)).toBeNull();
    expect(settings.getSettings().location).toEqual({ country: 'US', usState: 'KS' });
    expect(settings.updateSettings).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the opt-in flag is absent', { enabled: false }],
    ['the app is packaged', { packaged: true }],
    ['the profile was not explicitly selected', { explicitUserData: false }],
    ['the library pointer was not explicitly selected', { explicitLibrary: false }],
    [
      'the profile is the production default',
      { userData: 'C:\\Users\\tester\\AppData\\Roaming\\Scribe' },
    ],
    [
      'the profile is outside the temp directory',
      { userData: 'C:\\Users\\tester\\Documents\\Scribe' },
    ],
    [
      'the library is outside the temp directory',
      { libraryRoot: 'C:\\Users\\tester\\Documents\\Scribe' },
    ],
    [
      'the library is the profile itself',
      { libraryRoot: 'C:\\Users\\tester\\AppData\\Local\\Temp\\scribe-test\\profile' },
    ],
  ])('does not seed when %s', (_reason, overrides) => {
    const { settings } = settingsStore();
    expect(
      ensureSyntheticDevelopmentLocation(settings, { ...isolatedProfile, ...overrides }),
    ).toBeNull();
    expect(settings.getSettings().location).toEqual({ country: null, usState: null });
    expect(settings.updateSettings).not.toHaveBeenCalled();
  });

  it('leaves an existing location unchanged', () => {
    const { settings } = settingsStore({ country: 'US', usState: 'IL' });
    expect(ensureSyntheticDevelopmentLocation(settings, isolatedProfile, () => 15)).toBeNull();
    expect(settings.getSettings().location).toEqual({ country: 'US', usState: 'IL' });
    expect(settings.updateSettings).not.toHaveBeenCalled();
  });
});
