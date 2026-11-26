import type { TranscriptFile } from './formats/transcript.ts';
import type { VoicesFile } from './voices-file.ts';
import { weightedMean, type VoiceContribution } from './db/voice-profiles.ts';

/**
 * Speakers whose saved voice no longer stands for one person: merged away, or a merge, split or
 * reassign touched their words. Their embedding must not teach a profile.
 */
function touchedSpeakers(transcript: TranscriptFile): Set<string> {
  const touched = new Set<string>();
  for (const speaker of transcript.speakers) {
    if (speaker.mergedInto !== null) touched.add(speaker.id);
  }
  for (const override of transcript.speakerOverrides) {
    touched.add(override.speakerId);
    for (const segment of transcript.segments) {
      const first = segment.words[0];
      const last = segment.words.at(-1);
      if (!first || !last || segment.track !== override.track) continue;
      if (first.startMs < override.endMs && last.endMs > override.startMs) {
        touched.add(segment.speakerId);
      }
    }
  }
  return touched;
}

export interface DesiredContributions {
  /** Profiles that a hand-named, untouched speaker points at, whether or not a voice exists. */
  qualifying: Set<string>;
  /** One combined contribution per profile, for speakers with a voice in `voices.json`. */
  wanted: Map<string, Omit<VoiceContribution, 'profileId' | 'meetingId'>>;
  /** A hand-named speaker points at a profile that no longer exists (after a profile merge). */
  dangling: boolean;
}

/** What this meeting should contribute, derived only from the transcript and `voices.json`. */
export function desiredContributions(
  transcript: TranscriptFile,
  voices: VoicesFile | null,
  profileExists: (profileId: string) => boolean,
): DesiredContributions {
  const touched = touchedSpeakers(transcript);
  const qualifying = new Set<string>();
  const parts = new Map<string, { embedding: Float32Array; sampleCount: number }[]>();
  let dangling = false;
  for (const speaker of transcript.speakers) {
    if (
      !speaker.userNamed ||
      speaker.profileId === null ||
      speaker.mergedInto !== null ||
      touched.has(speaker.id)
    ) {
      continue;
    }
    if (!profileExists(speaker.profileId)) {
      dangling = true;
      continue;
    }
    qualifying.add(speaker.profileId);
    const entry = voices?.speakers.find((voice) => voice.speakerId === speaker.id);
    if (!entry) continue;
    const list = parts.get(speaker.profileId) ?? [];
    list.push({ embedding: entry.embedding, sampleCount: entry.segments });
    parts.set(speaker.profileId, list);
  }
  const wanted: DesiredContributions['wanted'] = new Map();
  for (const [profileId, list] of parts) {
    // Mixed vector sizes cannot be one mean; skip them rather than fail the edit.
    if (new Set(list.map((part) => part.embedding.length)).size !== 1) continue;
    const { embedding, sampleCount } = weightedMean(list);
    wanted.set(profileId, { embedding, sampleCount, modelId: voices?.modelId ?? '' });
  }
  return { qualifying, wanted, dangling };
}
