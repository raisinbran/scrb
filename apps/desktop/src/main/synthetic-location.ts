import { randomInt } from 'node:crypto';
import path from 'node:path';

const US_STATE_CODES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;

interface SettingsWriter {
  getSettings(): { location: { country: string | null; usState: string | null } };
  updateSettings(patch: { location: { country: string; usState: string } }): void;
}

interface SyntheticLocationOptions {
  enabled: boolean;
  packaged: boolean;
  explicitUserData: boolean;
  explicitLibrary: boolean;
  userData: string;
  libraryRoot: string;
  tempRoot: string;
  appData: string;
  appName: string;
  platform: NodeJS.Platform;
}

/** Seeds only an explicitly opted-in, unpackaged profile and test library under the OS temp dir. */
export function ensureSyntheticDevelopmentLocation(
  settings: SettingsWriter,
  options: SyntheticLocationOptions,
  chooseIndex: (exclusiveMaximum: number) => number = (maximum) => randomInt(maximum),
): string | null {
  if (!options.enabled || options.packaged || !options.explicitUserData || !options.explicitLibrary)
    return null;

  const paths = options.platform === 'win32' ? path.win32 : path;
  const userData = paths.resolve(options.userData);
  const libraryRoot = paths.resolve(options.libraryRoot);
  const tempRoot = paths.resolve(options.tempRoot);
  const defaultUserData = paths.resolve(options.appData, options.appName);
  const normalizeForCompare = (value: string) =>
    options.platform === 'win32' ? value.toLowerCase() : value;
  if (
    normalizeForCompare(userData) === normalizeForCompare(defaultUserData) ||
    normalizeForCompare(userData) === normalizeForCompare(libraryRoot)
  )
    return null;

  const isInsideTemp = (target: string) => {
    const relative = paths.relative(tempRoot, target);
    return (
      relative !== '' &&
      relative !== '..' &&
      !relative.startsWith(`..${paths.sep}`) &&
      !paths.isAbsolute(relative)
    );
  };
  if (!isInsideTemp(userData) || !isInsideTemp(libraryRoot)) return null;

  // Any saved location belongs to the user or test fixture and must remain authoritative.
  if (settings.getSettings().location.country !== null) return null;

  const usState = US_STATE_CODES[chooseIndex(US_STATE_CODES.length)];
  if (!usState) throw new RangeError('Synthetic location selection was outside the state list.');
  settings.updateSettings({ location: { country: 'US', usState } });
  return usState;
}
