import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { matchVoices, type FinalTranscript } from '@scrb/transcription';
import type { Library, StoredSuggestion, TranscriptFile, VoiceProfile } from '@scrb/storage';

/** A profile needs at least this many segments before it may name a speaker without asking. */
export const minAutoProfileSegments = 8;

export interface ProfileSuggestionNotice {
  meetingId: string;
  speakerId: string;
  profileId: string;
  profileName: string;
}

export const APPROVED_EMBEDDING_SHA256 =
  '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b';
export const APPROVED_PROFILE_MODEL = `sha256:${APPROVED_EMBEDDING_SHA256}`;

export interface ProfileAssignmentEdit {
  before: TranscriptFile;
  after: TranscriptFile;
}

export type ProfileMatchingJob = (
  meetingId: string,
  transcript: FinalTranscript,
  modelPath: string | undefined,
  signal: AbortSignal,
) => Promise<ProfileAssignmentEdit | undefined>;

export async function hashModel(path: string): Promise<string> {
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
  onSuggestion?: (suggestion: ProfileSuggestionNotice) => void,
): ProfileMatchingJob {
  let profiles: VoiceProfile[];
  try {
    profiles = library.voiceProfiles
      .list()
      .filter(
        (profile) =>
          profile.modelId === APPROVED_PROFILE_MODEL &&
          profile.name !== null &&
          profile.name.trim() !== '',
      );
  } catch {
    library.logger.log('warn', 'profile-matching-skipped', { reason: 'snapshot-unavailable' });
    return async () => undefined;
  }
  return async (meetingId, transcript, modelPath, signal) => {
    let before: TranscriptFile | undefined;
    const assignments: { speaker: TranscriptFile['speakers'][number]; profile: VoiceProfile }[] =
      [];
    const suggestions: StoredSuggestion[] = [];
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
          if (match.kind === 'unknown') continue;
          const speaker = before.speakers.find((s) => s.id === speakerId);
          const profile = profiles.find((p) => p.id === match.profileId);
          if (!speaker || !profile) continue;
          if (match.kind === 'auto' && profile.sampleCount >= minAutoProfileSegments) {
            assignments.push({ speaker, profile });
          } else {
            suggestions.push({
              speakerId,
              profileId: profile.id,
              score: match.score,
              status: 'pending',
            });
          }
        }
      }
      // A reprocess replaces the old pass's suggestions, so this runs even with none to add.
      await saveSuggestions(library, meetingId, suggestions, profiles, onSuggestion);
      if (assignments.length === 0) return;
      const after = await library.assignSpeakerProfiles(
        meetingId,
        assignments,
        before.revision,
        signal,
      );
      return { before, after };
    } catch {
      // A rename may have committed even if its directory sync reported a failure. Never retry.
      let outcome = 'unknown';
      let committed: ProfileAssignmentEdit | undefined;
      try {
        const saved = await library.readTranscript(meetingId);
        const complete =
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
          );
        if (complete && before) {
          outcome = 'committed';
          committed = { before, after: saved };
        } else {
          outcome = before && saved.revision > before.revision + 1 ? 'ambiguous' : 'uncommitted';
        }
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
      return committed;
    }
  };
}

async function saveSuggestions(
  library: Library,
  meetingId: string,
  suggestions: StoredSuggestion[],
  profiles: VoiceProfile[],
  notify: ((suggestion: ProfileSuggestionNotice) => void) | undefined,
): Promise<void> {
  let stored: StoredSuggestion[];
  try {
    stored = await library.replaceSuggestions(meetingId, suggestions);
  } catch {
    library.logger.log('warn', 'suggestions-not-saved', {});
    return;
  }
  for (const s of stored.filter((item) => item.status === 'pending')) {
    const profile = profiles.find((p) => p.id === s.profileId);
    if (!profile?.name) continue;
    try {
      notify?.({
        meetingId,
        speakerId: s.speakerId,
        profileId: s.profileId,
        profileName: profile.name,
      });
    } catch {
      library.logger.log('warn', 'profile-matching-notification-failed', {});
    }
  }
}
