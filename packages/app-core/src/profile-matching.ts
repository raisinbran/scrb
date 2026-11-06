import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { matchVoices, type FinalTranscript } from '@scrb/transcription';
import type { Library, TranscriptFile, VoiceProfile } from '@scrb/storage';

export const APPROVED_EMBEDDING_SHA256 =
  '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b';
export const APPROVED_PROFILE_MODEL = `sha256:${APPROVED_EMBEDDING_SHA256}`;

export type ProfileMatchingJob = (
  meetingId: string,
  transcript: FinalTranscript,
  modelPath: string | undefined,
  signal: AbortSignal,
) => Promise<void>;

async function hashModel(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

function normalize(vector: readonly number[]): number[] | null {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) return null;
  const norm = Math.hypot(...vector);
  return norm > 0 && Number.isFinite(norm) ? vector.map((value) => value / norm) : null;
}

/** Snapshot before inference; optional matching never writes the profile store. */
export function startProfileMatching(
  library: Library,
  fingerprint: (path: string) => Promise<string> = hashModel,
): ProfileMatchingJob {
  let profiles: VoiceProfile[];
  try {
    profiles = library.voiceProfiles
      .list()
      .filter(
        (profile) =>
          profile.modelId === APPROVED_PROFILE_MODEL &&
          profile.name !== null &&
          profile.name.trim() !== '' &&
          profile.sampleCount >= 8,
      );
  } catch {
    library.logger.log('warn', 'profile-matching-skipped', { reason: 'snapshot-unavailable' });
    return async () => undefined;
  }
  return async (meetingId, transcript, modelPath, signal) => {
    let before: TranscriptFile | undefined;
    const assignments: { speaker: TranscriptFile['speakers'][number]; profile: VoiceProfile }[] =
      [];
    try {
      if (signal.aborted || !modelPath) return;
      before = await library.readTranscript(meetingId);
      if ((await fingerprint(modelPath)) !== APPROVED_EMBEDDING_SHA256) {
        library.logger.log('warn', 'profile-matching-skipped', { reason: 'unverified-model' });
        return;
      }
      const protectedIds = new Set([
        ...before.speakers.filter((s) => s.userNamed || s.mergedInto !== null).map((s) => s.id),
        ...before.speakers.flatMap((s) => s.mergedInto ?? []),
        ...before.speakerOverrides.map((override) => override.speakerId),
      ]);
      const voices = transcript.speakers.flatMap((voice) => {
        const embedding = normalize(voice.embedding ?? []);
        return embedding && voice.id !== 'you' && !protectedIds.has(voice.id)
          ? [{ speakerId: voice.id, embedding, segments: voice.embeddingSegments }]
          : [];
      });
      const normalized = profiles.flatMap((profile) => {
        const embedding = normalize(Array.from(profile.embedding));
        return embedding && !profile.meetingIds.includes(meetingId)
          ? [{ id: profile.id, name: profile.name, embedding, segments: profile.sampleCount }]
          : [];
      });
      for (const dimension of new Set(voices.map((voice) => voice.embedding.length))) {
        const matches = matchVoices(
          voices.filter((voice) => voice.embedding.length === dimension),
          normalized.filter((profile) => profile.embedding.length === dimension),
        );
        for (const [speakerId, match] of matches) {
          if (match.kind !== 'auto') continue;
          const speaker = before.speakers.find((s) => s.id === speakerId);
          const profile = profiles.find((p) => p.id === match.profileId);
          if (speaker && profile) assignments.push({ speaker, profile });
        }
      }
      if (assignments.length === 0) return;
      await library.assignSpeakerProfiles(meetingId, assignments, before.revision, signal);
    } catch {
      // A rename may have committed even if its directory sync reported a failure. Never retry.
      let outcome = 'unknown';
      try {
        const saved = await library.readTranscript(meetingId);
        outcome =
          before &&
          saved.revision === before.revision + 1 &&
          assignments.length > 0 &&
          assignments.every(({ speaker, profile }) =>
            saved.speakers.some(
              (s) =>
                s.id === speaker.id &&
                s.profileId === profile.id &&
                s.name === profile.name &&
                !s.userNamed,
            ),
          )
            ? 'committed'
            : 'uncommitted';
      } catch {
        /* The core transcript remains authoritative if inspection is unavailable. */
      }
      library.logger.log(
        'warn',
        outcome === 'committed'
          ? 'profile-matching-committed-after-warning'
          : 'profile-matching-skipped',
        { outcome },
      );
    }
  };
}
