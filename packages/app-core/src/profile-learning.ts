import { CorrectionConflictError, type RenameLearning, type VoiceProfile } from '@scrb/storage';
import { APPROVED_PROFILE_MODEL } from './profile-matching.ts';

/** A hand rename grows an existing same-name profile silently only at or above this cosine. */
export const silentGrowCosine = 0.55;
/** A speaker needs at least this many embedding segments to create or grow a profile. */
export const minProfileSegments = 8;

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : -1;
}

const DEFAULT_LABEL = /^speaker \d+$/i;

function sameName(a: string | null, b: string): boolean {
  return a !== null && a.trim().toLowerCase() === b.toLowerCase();
}

/**
 * What a hand rename teaches (profile growth plan, "Learning rule"). Only the owner's own naming
 * teaches: auto matches never reach here. `acceptProfileId` is a suggestion the owner accepted;
 * it skips the cosine gate and grows that profile.
 */
export function renameLearning(options: { acceptProfileId?: string } = {}): RenameLearning {
  return ({ name: rawName, speaker, voice, voicesModelId, touched, linked, profiles }) => {
    const name = rawName.trim();
    const none = { unlink: false, target: null };
    if (name === '' || DEFAULT_LABEL.test(name) || name.toLowerCase() === 'you') return none;
    // The accepted profile may have been deleted or merged since the owner was asked: never
    // fall through to creating a new profile under its old name.
    if (
      options.acceptProfileId !== undefined &&
      !profiles.some((profile) => profile.id === options.acceptProfileId)
    ) {
      throw new CorrectionConflictError('That voice profile no longer exists.');
    }
    // Renaming away from the linked profile's name cuts the link, whatever the voice data says.
    const unlink = linked !== null && !sameName(linked.name, name);
    if (
      voice === null ||
      voicesModelId !== APPROVED_PROFILE_MODEL ||
      voice.segments < minProfileSegments ||
      touched ||
      speaker.mergedInto !== null
    ) {
      return { unlink, target: null };
    }
    const candidates: VoiceProfile[] = profiles.filter(
      (profile) =>
        profile.modelId === voicesModelId &&
        profile.embedding.length === voice.embedding.length &&
        (options.acceptProfileId === undefined
          ? sameName(profile.name, name)
          : profile.id === options.acceptProfileId),
    );
    let best: { profile: VoiceProfile; score: number } | null = null;
    for (const profile of candidates) {
      const score = cosine(voice.embedding, profile.embedding);
      if (best === null || score > best.score) best = { profile, score };
    }
    if (
      best !== null &&
      (options.acceptProfileId !== undefined || best.score >= silentGrowCosine)
    ) {
      return { unlink: false, target: { profileId: best.profile.id } };
    }
    if (options.acceptProfileId !== undefined) return { unlink: false, target: null };
    return { unlink, target: { create: name } };
  };
}
