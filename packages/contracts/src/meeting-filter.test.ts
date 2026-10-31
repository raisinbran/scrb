import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesMeetingFilter } from './meeting-filter.ts';

afterEach(() => vi.unstubAllEnvs());

describe('local calendar meeting date filters', () => {
  it('includes the last local day even when UTC has crossed midnight', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const meeting = { origin: 'recorded' as const, startedAt: '2026-11-01T00:15:00Z' };
    expect(matchesMeetingFilter(meeting, { from: '2026-10-31', to: '2026-10-31' }))
      .toBe(true);
    expect(matchesMeetingFilter(meeting, { from: '2026-11-01' })).toBe(false);
  });

  it('handles an eastern time zone whose local day leads UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland');
    const meeting = { origin: 'imported' as const, startedAt: '2026-10-31T11:30:00Z' };
    expect(matchesMeetingFilter(meeting, { from: '2026-11-01', to: '2026-11-01' }))
      .toBe(true);
    expect(matchesMeetingFilter(meeting, { to: '2026-10-31' })).toBe(false);
    expect(matchesMeetingFilter(meeting, { origin: 'recorded' })).toBe(false);
  });
});
