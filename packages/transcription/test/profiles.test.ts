import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_POLICY,
  growProfile,
  matchVoices,
  profileChanges,
  type MeetingVoice,
  type VoiceProfile,
} from '../src/profiles.js';
import { unit } from '../src/speakers.js';

/** A unit vector with exactly this cosine against [1, 0]. */
const at = (score: number): number[] => [score, Math.sqrt(1 - score * score)];

const profile = (over: Partial<VoiceProfile> = {}): VoiceProfile => ({
  id: 'p1', name: 'Ada', embedding: [1, 0], segments: 20, ...over,
});
const voice = (score: number, speakerId = 's1'): MeetingVoice => ({
  speakerId, embedding: at(score), segments: 10,
});

describe('matchVoices', () => {
  it('sits inside the measured 0.55--0.60 band', () => {
    expect(DEFAULT_MATCH_POLICY.autoLine).toBeGreaterThanOrEqual(0.55);
    expect(DEFAULT_MATCH_POLICY.autoLine).toBeLessThanOrEqual(0.6);
  });

  it('assigns above the line, suggests below it, and stays unknown under that', () => {
    expect(matchVoices([voice(0.7)], [profile()]).get('s1')?.kind).toBe('auto');
    expect(matchVoices([voice(0.5)], [profile()]).get('s1')?.kind).toBe('suggest');
    expect(matchVoices([voice(0.3)], [profile()]).get('s1')?.kind).toBe('unknown');
  });

  it('never auto-names from a thin profile', () => {
    expect(matchVoices([voice(0.9)], [profile({ segments: 5 })]).get('s1')?.kind).toBe('suggest');
  });

  it('never auto-names from an unnamed profile', () => {
    expect(matchVoices([voice(0.9)], [profile({ name: null })]).get('s1')?.kind).toBe('suggest');
  });

  it('gives one profile to only one speaker in a meeting, strongest first', () => {
    const m = matchVoices([voice(0.7, 'weak'), voice(0.9, 'strong')], [profile()]);
    expect(m.get('strong')?.kind).toBe('auto');
    expect(m.get('weak')?.kind).toBe('suggest');
  });

  it('handles no profiles', () => {
    expect(matchVoices([voice(0.9)], []).get('s1')?.kind).toBe('unknown');
  });
});

describe('profileChanges', () => {
  const profiles = [profile()];

  it('changes nothing when profile building is off, even with a match', () => {
    const voices = [voice(0.9), voice(0.1, 'new')];
    const matches = matchVoices(voices, profiles);
    expect(matches.get('s1')?.kind).toBe('auto');
    expect(profileChanges(voices, matches, profiles, false)).toEqual({ updated: [], created: [] });
  });

  it('grows auto matches, creates for unknowns, leaves suggestions alone', () => {
    const voices = [voice(0.9, 'known'), voice(0.5, 'maybe'), voice(0.1, 'new')];
    // 'maybe' and 'known' claim one profile; 'maybe' falls to a suggestion.
    const changes = profileChanges(voices, matchVoices(voices, profiles), profiles, true);
    expect(changes.updated.map((p) => p.id)).toEqual(['p1']);
    expect(changes.updated[0]?.segments).toBe(30);
    expect(changes.created.map((v) => v.speakerId)).toEqual(['new']);
  });
});

describe('growProfile', () => {
  it('weights by segments and stays unit length', () => {
    const grown = growProfile(profile({ segments: 30 }), {
      speakerId: 's', embedding: [0, 1], segments: 10,
    });
    expect(grown.embedding).toEqual(unit([0.75, 0.25]));
    expect(Math.hypot(...grown.embedding)).toBeCloseTo(1);
  });
});
