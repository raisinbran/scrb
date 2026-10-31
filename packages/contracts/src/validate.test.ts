import { describe, expect, it } from 'vitest';
import { CALL_NAMES, MAX_TRANSCRIPT_PAGE, isValidRequest } from './index.ts';

const page = (offset: unknown, limit: unknown) => ({ meetingId: 'm-1', offset, limit });

describe('isValidRequest', () => {
  it('has a check for every call', () => {
    for (const name of CALL_NAMES) expect(() => isValidRequest(name, {})).not.toThrow();
  });

  it('validates retry and undo state requests and allowlists both calls', () => {
    for (const name of ['getUndoState', 'retryFinalPass'] as const) {
      expect(isValidRequest(name, { meetingId: 'm-1' })).toBe(true);
      expect(isValidRequest(name, { meetingId: '../secret' })).toBe(false);
      expect(isValidRequest(name, { meetingId: 'm-1', path: '/tmp' })).toBe(false);
      expect(CALL_NAMES).toContain(name);
    }
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

  it('validates speaker suggestion queries without allowing filesystem keys', () => {
    expect(isValidRequest('listSpeakerSuggestions', {})).toBe(true);
    expect(isValidRequest('listSpeakerSuggestions', { meetingId: 'm-1' })).toBe(true);
    expect(isValidRequest('listSpeakerSuggestions', { meetingId: '../private' })).toBe(false);
    expect(isValidRequest('listSpeakerSuggestions', { path: '/tmp' })).toBe(false);
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

  it('allows only a no-argument privacy jurisdictions lookup', () => {
    expect(CALL_NAMES).toContain('getPrivacyJurisdictions');
    expect(isValidRequest('getPrivacyJurisdictions', undefined)).toBe(true);
    expect(isValidRequest('getPrivacyJurisdictions', { path: '/private' })).toBe(false);
  });

  it('vocabulary history calls have no writable request parameters', () => {
    for (const call of ['getVocabularyUndoState', 'undoVocabulary', 'redoVocabulary'] as const) {
      expect(isValidRequest(call, undefined)).toBe(true);
      expect(isValidRequest(call, { otherTermId: 'secret' })).toBe(false);
      expect(CALL_NAMES).toContain(call);
    }
  });

  it('shares the exact meeting-filter check between list and search', () => {
    for (const filter of [
      { origin: 'recorded', from: '2026-10-01', to: '2026-11-01' },
      { origin: 'imported' },
    ]) {
      expect(isValidRequest('listMeetings', { filter })).toBe(true);
      expect(isValidRequest('searchMeetings', { query: 'invented', filter })).toBe(true);
    }
    const invalid = { origin: 'other', from: 'yesterday' };
    expect(isValidRequest('listMeetings', { filter: invalid })).toBe(false);
    expect(isValidRequest('searchMeetings', { query: 'invented', filter: invalid })).toBe(false);
    expect(isValidRequest('searchMeetings', { query: 'invented', filter: { path: '/secret' } })).toBe(false);
  });

  it('checks date formats', () => {
    const ok = { filter: { from: '2026-10-01', to: '2026-10-30T12:00:00Z' } };
    expect(isValidRequest('listMeetings', ok)).toBe(true);
    expect(isValidRequest('listMeetings', { filter: { from: 'last week' } })).toBe(false);
  });

  it('summary additions cannot submit an id or trusted evidence', () => {
    const request = (update: object) => ({ meetingId: 'm-1', update });
    const action = {
      action: 'Invented task',
      owner: null,
      ownerUnconfirmed: false,
      deadline: null,
      deadlineUnconfirmed: false,
      status: 'proposed',
      sourceMs: 0,
    };
    expect(isValidRequest('updateSummaryItem', request({
      kind: 'add', collection: 'actionItems', item: action,
    }))).toBe(true);
    expect(isValidRequest('updateSummaryItem', request({
      kind: 'add', collection: 'actionItems', item: { ...action, id: 'spoof' },
    }))).toBe(false);
    expect(isValidRequest('updateSummaryItem', request({
      kind: 'add', collection: 'actionItems', item: { ...action, edited: false },
    }))).toBe(false);
    expect(isValidRequest('updateSummaryItem', request({
      kind: 'add', collection: 'openQuestions', item: { question: 'Invented?', sourceMs: 0 },
    }))).toBe(true);
    expect(isValidRequest('updateSummaryItem', request({
      kind: 'remove', collection: 'decisions', itemId: 'd1',
    }))).toBe(true);
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
