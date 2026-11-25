import { describe, expect, it } from 'vitest';
import { DEFAULT_JURISDICTIONS, needsPrivacyBanner } from './privacy.ts';

describe('privacy banner jurisdiction', () => {
  it.each(['IL', 'TX', 'WA', 'CA', 'CO'])('shows for listed US state %s', (usState) => {
    expect(needsPrivacyBanner({ country: 'US', usState }, DEFAULT_JURISDICTIONS, null)).toBe(true);
  });
  it.each(['NY', 'OR', 'AZ'])('does not claim unlisted state %s is listed', (usState) => {
    expect(needsPrivacyBanner({ country: 'US', usState }, DEFAULT_JURISDICTIONS, null)).toBe(false);
  });
  it.each(['GB', 'DE', 'NO'])('shows for listed non-US country %s', (country) => {
    expect(needsPrivacyBanner({ country, usState: null }, DEFAULT_JURISDICTIONS, null)).toBe(true);
  });
  it.each([
    ['DE', true],
    ['AU', false],
    [null, false],
  ] as const)(
    'uses the operating-system country (%s) when onboarding selected outside the US',
    (osCountry, expected) => {
      expect(
        needsPrivacyBanner({ country: 'ZZ', usState: null }, DEFAULT_JURISDICTIONS, osCountry),
      ).toBe(expected);
    },
  );
  it('uses OS country for unanswered locations and respects a US state selection', () => {
    expect(needsPrivacyBanner({ country: null, usState: null }, DEFAULT_JURISDICTIONS, 'DE')).toBe(
      true,
    );
    expect(needsPrivacyBanner({ country: 'US', usState: 'OR' }, DEFAULT_JURISDICTIONS, 'DE')).toBe(
      false,
    );
  });
});
