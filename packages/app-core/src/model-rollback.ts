import { resolve } from 'node:path';
import { verifyPinnedModel, type PinnedModelArtifact } from './model-artifacts.ts';

export interface VerifiedRollback {
  active: PinnedModelArtifact;
  previous: PinnedModelArtifact;
}

/** Chooses only a verified installed candidate. The owner-approved registry will commit the switch. */
export async function chooseVerifiedRollback(
  current: PinnedModelArtifact,
  candidate: PinnedModelArtifact | null,
): Promise<VerifiedRollback> {
  if (!candidate || resolve(current.path) === resolve(candidate.path)) {
    throw new Error('No separate previous model was pinned');
  }
  const verification = await verifyPinnedModel(candidate);
  if (!verification.ok) throw new Error('Previous pinned model failed verification');
  return { active: candidate, previous: current };
}
