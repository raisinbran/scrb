import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PrivacyJurisdictions {
  countries: string[];
  usStates: string[];
}

export const DEFAULT_JURISDICTIONS: PrivacyJurisdictions = {
  countries: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB',
  ],
  usStates: ['IL', 'TX', 'WA', 'CA', 'CO'],
};

export async function privacyJurisdictions(libraryRoot: string): Promise<PrivacyJurisdictions> {
  const path = join(libraryRoot, 'privacy-jurisdictions.json');
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const initial = JSON.stringify(DEFAULT_JURISDICTIONS, null, 2);
    try { await writeFile(path, initial, { flag: 'wx' }); } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
    }
    content = await readFile(path, 'utf8');
  }
  const parsed = JSON.parse(content) as Partial<PrivacyJurisdictions>;
  const clean = (values: unknown): values is string[] =>
    Array.isArray(values) && values.every((value) => typeof value === 'string' &&
      /^[A-Z]{2}$/.test(value)) && values.length <= 500;
  if (!clean(parsed.countries) || !clean(parsed.usStates)) {
    throw new Error('The privacy-jurisdictions.json file has invalid entries.');
  }
  return { countries: parsed.countries, usStates: parsed.usStates };
}

/** The banner reminds users about profiling; it makes no legal jurisdiction claim. */
export function needsPrivacyBanner(
  location: { country: string | null; usState: string | null },
  rules: PrivacyJurisdictions,
  osCountry: string | null,
): boolean {
  const country = location.country === null ? osCountry : location.country;
  if (!country) return false;
  if (country === 'US') return location.usState !== null && rules.usStates.includes(location.usState);
  return rules.countries.includes(country);
}
