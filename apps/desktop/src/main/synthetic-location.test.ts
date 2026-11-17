import { describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@scrb/contracts';
import { ensureSyntheticDevelopmentLocation } from './synthetic-location.ts';

function settingsStore() {
  let location: AppSettings['location'] = { country: null, usState: null };
  const settings = {
    getSettings: () => ({ location }) as AppSettings,
    updateSettings: vi.fn((patch: { location: { country: string; usState: string } }) => {
      location = patch.location;
      return { location } as AppSettings;
    }),
  };
  return { settings };
}

describe('synthetic development location', () => {
  const isolatedProfile = {
    packaged: false,
    userData: 'C:\\Users\\tester\\AppData\\Local\\Temp\\scribe-test\\profile',
    libraryRoot: 'C:\\Users\\tester\\AppData\\Local\\Temp\\scribe-test\\library',
    tempRoot: 'C:\\Users\\tester\\AppData\\Local\\Temp',
    appData: 'C:\\Users\\tester\\AppData\\Roaming',
    appName: 'Scribe',
    platform: 'win32' as const,
  };

  it('persists a random fictional state through the real settings handler for an isolated dev profile', () => {
    const { settings } = settingsStore();
    const result = ensureSyntheticDevelopmentLocation(settings, isolatedProfile, () => 15);

    expect(result).toBe('KS');
    expect(settings.updateSettings).toHaveBeenCalledWith({
      location: { country: 'US', usState: 'KS' },
    });
  });

  it('leaves the default and packaged profiles unchanged', () => {
    const { settings: defaultSettings } = settingsStore();
    expect(
      ensureSyntheticDevelopmentLocation(defaultSettings, {
        ...isolatedProfile,
        userData: 'C:\\Users\\tester\\AppData\\Roaming\\Scribe',
      }),
    ).toBeNull();
    expect(defaultSettings.getSettings().location).toEqual({ country: null, usState: null });

    const { settings: packagedSettings } = settingsStore();
    expect(
      ensureSyntheticDevelopmentLocation(packagedSettings, { ...isolatedProfile, packaged: true }),
    ).toBeNull();
    expect(packagedSettings.getSettings().location).toEqual({ country: null, usState: null });
  });

  it('does not change a library outside the temporary test root', () => {
    const { settings } = settingsStore();
    expect(
      ensureSyntheticDevelopmentLocation(settings, {
        ...isolatedProfile,
        libraryRoot: 'C:\\Users\\tester\\Documents\\Meeting Scribe',
      }),
    ).toBeNull();
    expect(settings.updateSettings).not.toHaveBeenCalled();
  });

  it('replaces a saved location in the isolated profile with a fictional state', () => {
    const { settings } = settingsStore();
    settings.updateSettings({ location: { country: 'US', usState: 'IL' } });

    expect(ensureSyntheticDevelopmentLocation(settings, isolatedProfile, () => 15)).toBe('KS');
    expect(settings.getSettings().location).toEqual({ country: 'US', usState: 'KS' });
  });
});
