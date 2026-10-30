import { describe, expect, it } from 'vitest';
import { CALL_NAMES, MAX_TRANSCRIPT_PAGE, isValidRequest } from './index.ts';

const page = (offset: unknown, limit: unknown) => ({ meetingId: 'm-1', offset, limit });

describe('isValidRequest', () => {
  it('has a check for every call', () => {
    for (const name of CALL_NAMES) expect(() => isValidRequest(name, {})).not.toThrow();
  });

  it('accepts no request for a call that takes none', () => {
    expect(isValidRequest('getSettings', undefined)).toBe(true);
    expect(isValidRequest('getSettings', { extra: true })).toBe(false);
  });

  it('bounds transcript pages', () => {
    expect(isValidRequest('getTranscript', page(0, MAX_TRANSCRIPT_PAGE))).toBe(true);
    expect(isValidRequest('getTranscript', page(0, MAX_TRANSCRIPT_PAGE + 1))).toBe(false);
    expect(isValidRequest('getTranscript', page(-1, 10))).toBe(false);
    expect(isValidRequest('getTranscript', page(0, 0))).toBe(false);
    expect(isValidRequest('getTranscript', page(1.5, 10))).toBe(false);
    expect(isValidRequest('getTranscript', page('0', 10))).toBe(false);
    expect(isValidRequest('getTranscript', page(Number.NaN, 10))).toBe(false);
  });

  it('refuses unknown keys and inherited names', () => {
    expect(isValidRequest('getMeeting', { meetingId: 'm-1', path: '/etc' })).toBe(false);
    expect(isValidRequest('getMeeting', JSON.parse('{"meetingId":"m","__proto__":{}}'))).toBe(
      false,
    );
    expect(isValidRequest('getMeeting', ['m-1'])).toBe(false);
    expect(isValidRequest('getMeeting', null)).toBe(false);
  });

  it('refuses ids that could be paths', () => {
    expect(isValidRequest('getMeeting', { meetingId: '../../secrets' })).toBe(false);
    expect(isValidRequest('getMeeting', { meetingId: '' })).toBe(false);
    expect(isValidRequest('getMeeting', { meetingId: 'a'.repeat(129) })).toBe(false);
  });

  it('checks unions by kind', () => {
    const profile = { target: { kind: 'profile', profileId: 'p-1' }, name: 'Ana' };
    expect(isValidRequest('renameSpeaker', profile)).toBe(true);
    const wrong = { target: { kind: 'profile', meetingId: 'm-1', speakerId: 's' }, name: 'Ana' };
    expect(isValidRequest('renameSpeaker', wrong)).toBe(false);
  });

  it('checks partial settings against allowed values', () => {
    expect(isValidRequest('updateSettings', { audio: { echoCancellation: true } })).toBe(true);
    expect(isValidRequest('updateSettings', { theme: 'neon' })).toBe(false);
    expect(isValidRequest('updateSettings', { audio: { inputSensitivityDb: 'auto' } })).toBe(true);
    expect(isValidRequest('updateSettings', { audio: { inputSensitivityDb: 5 } })).toBe(false);
  });

  it('checks date formats', () => {
    const ok = { filter: { from: '2026-10-01', to: '2026-10-30T12:00:00Z' } };
    expect(isValidRequest('listMeetings', ok)).toBe(true);
    expect(isValidRequest('listMeetings', { filter: { from: 'last week' } })).toBe(false);
  });

  it('accepts each summary item kind', () => {
    const evidence = { alsoAtMs: [], needsReview: false, edited: true };
    const action = {
      id: 'a-1',
      action: 'Send it',
      owner: null,
      ownerUnconfirmed: true,
      deadline: null,
      deadlineUnconfirmed: false,
      status: 'agreed',
      sourceMs: 0,
      ...evidence,
    };
    const request = (kind: string, item: object) => ({
      meetingId: 'm-1',
      update: { kind, item },
    });
    expect(isValidRequest('updateSummaryItem', request('actionItem', action))).toBe(true);
    expect(isValidRequest('updateSummaryItem', request('decision', action))).toBe(false);
    expect(
      isValidRequest(
        'updateSummaryItem',
        request('openQuestion', { id: 'q', question: 'Why?', sourceMs: null, ...evidence }),
      ),
    ).toBe(true);
  });
});
