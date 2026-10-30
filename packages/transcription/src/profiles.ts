import { dot, unit } from './speakers.js';

/** Stores number lists only, never audio. */
export interface VoiceProfile {
  id: string;
  name: string | null;
  /** Unit length. */
  embedding: number[];
  /** Embedded stretches behind this profile. */
  segments: number;
}

export interface MeetingVoice {
  speakerId: string;
  /** Unit length. */
  embedding: number[];
  segments: number;
}

export interface MatchPolicy {
  /** Auto-assign at or above this.  Measured band 0.55--0.60 on eres2net only. */
  autoLine: number;
  /** Offer a suggestion at or above this. */
  suggestLine: number;
  /** A thinner profile only ever suggests. */
  minProfileSegments: number;
}

/**
 * 0.60 had no wrong match in 3,462 cross-session tests, 0.55 had 0.1--0.4%.
 * Below 0.45 strangers match too often to be worth showing.  Profiles from 4--5
 * segments were named far less reliably; the first healthy one measured had 8.
 */
export const DEFAULT_MATCH_POLICY: MatchPolicy = {
  autoLine: 0.6,
  suggestLine: 0.45,
  minProfileSegments: 8,
};

export type VoiceMatch =
  | { kind: 'auto'; profileId: string; score: number }
  | { kind: 'suggest'; profileId: string; score: number }
  | { kind: 'unknown' };

/**
 * Matches a meeting's voices against profiles.  One profile names at most one
 * speaker per meeting: the strongest claim wins and the others fall to a
 * suggestion, because one person cannot be two diarized speakers we trust.
 */
export function matchVoices(
  voices: MeetingVoice[],
  profiles: VoiceProfile[],
  policy: MatchPolicy = DEFAULT_MATCH_POLICY,
): Map<string, VoiceMatch> {
  const out = new Map<string, VoiceMatch>();
  const claims: { speakerId: string; profile: VoiceProfile; score: number }[] = [];
  for (const v of voices) {
    let best: VoiceProfile | undefined;
    let bestScore = -2;
    for (const p of profiles) {
      const score = dot(v.embedding, p.embedding);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    out.set(v.speakerId, { kind: 'unknown' });
    if (best && bestScore >= policy.suggestLine) {
      claims.push({ speakerId: v.speakerId, profile: best, score: bestScore });
    }
  }
  claims.sort((a, b) => b.score - a.score);
  const taken = new Set<string>();
  for (const c of claims) {
    const auto =
      c.score >= policy.autoLine &&
      c.profile.name !== null &&
      c.profile.segments >= policy.minProfileSegments &&
      !taken.has(c.profile.id);
    if (auto) taken.add(c.profile.id);
    out.set(c.speakerId, { kind: auto ? 'auto' : 'suggest', profileId: c.profile.id, score: c.score });
  }
  return out;
}

/** Grows a profile with new stretches, weighted by how many back each side. */
export function growProfile(profile: VoiceProfile, voice: MeetingVoice): VoiceProfile {
  const total = profile.segments + voice.segments;
  const mixed = profile.embedding.map(
    (x, i) => (x * profile.segments + voice.embedding[i]! * voice.segments) / (total || 1),
  );
  return { ...profile, embedding: unit(mixed), segments: total };
}

export interface ProfileChanges {
  /** Existing profiles with their new voice data. */
  updated: VoiceProfile[];
  /** Voices with no match: silently built, unnamed profiles. */
  created: MeetingVoice[];
}

/**
 * What a meeting does to the stored profiles.  Only an automatic match grows a
 * profile, so a wrong suggestion never pollutes one.  With `buildProfiles` off
 * (the default for imported files) names may still be applied, but this
 * returns no changes at all.
 */
export function profileChanges(
  voices: MeetingVoice[],
  matches: Map<string, VoiceMatch>,
  profiles: VoiceProfile[],
  buildProfiles: boolean,
): ProfileChanges {
  const changes: ProfileChanges = { updated: [], created: [] };
  if (!buildProfiles) return changes;
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const v of voices) {
    const m = matches.get(v.speakerId);
    if (m?.kind === 'auto') {
      const profile = byId.get(m.profileId);
      if (profile) changes.updated.push(growProfile(profile, v));
    } else if (!m || m.kind === 'unknown') {
      changes.created.push(v);
    }
  }
  return changes;
}
