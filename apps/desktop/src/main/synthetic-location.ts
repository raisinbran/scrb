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
  updateSettings(patch: { location: { country: string; usState: string } }): void;
}

/** Assigns a fictional state to a non-packaged profile distinct from the default profile. */
export function ensureSyntheticDevelopmentLocation(
  settings: SettingsWriter,
  options: {
    packaged: boolean;
    userData: string;
    libraryRoot: string;
    tempRoot: string;
    appData: string;
    appName: string;
    platform: NodeJS.Platform;
  },
  chooseIndex: (exclusiveMaximum: number) => number = (maximum) => randomInt(maximum),
): string | null {
  if (options.packaged) return null;
  const paths = options.platform === 'win32' ? path.win32 : path;
  const userData = paths.resolve(options.userData);
  const libraryRoot = paths.resolve(options.libraryRoot);
  const tempRoot = paths.resolve(options.tempRoot);
  const defaultUserData = paths.resolve(options.appData, options.appName);
  const pathComparison =
    options.platform === 'win32'
      ? (value: string) => value.toLowerCase()
      : (value: string) => value;
  if (pathComparison(userData) === pathComparison(defaultUserData)) return null;
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

  const index = chooseIndex(US_STATE_CODES.length);
  const usState = US_STATE_CODES[index];
  if (!usState) throw new RangeError('Synthetic location selection was outside the state list.');
  settings.updateSettings({ location: { country: 'US', usState } });
  return usState;
}
