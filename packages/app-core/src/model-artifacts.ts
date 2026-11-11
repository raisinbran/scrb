import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';

/** Approved manifest information must be supplied by the owner; no URLs or network I/O here. */
export interface PinnedModelArtifact {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export type ModelVerification =
  | { ok: true; sha256: string }
  | {
      ok: false;
      reason:
        | 'invalidManifest'
        | 'missing'
        | 'unsafeFile'
        | 'sizeMismatch'
        | 'hashMismatch'
        | 'readFailed';
    };

const SHA256 = /^[a-f0-9]{64}$/i;

/** Fail closed on tampered, incomplete or symlinked local model files without changing them. */
export async function verifyPinnedModel(artifact: PinnedModelArtifact): Promise<ModelVerification> {
  if (
    !SHA256.test(artifact.sha256) ||
    !Number.isSafeInteger(artifact.sizeBytes) ||
    artifact.sizeBytes <= 0 ||
    artifact.path.trim() === ''
  )
    return { ok: false, reason: 'invalidManifest' };

  let info;
  try {
    info = await lstat(artifact.path);
  } catch (error) {
    return {
      ok: false,
      reason: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'readFailed',
    };
  }
  if (!info.isFile() || info.isSymbolicLink()) return { ok: false, reason: 'unsafeFile' };
  if (info.size !== artifact.sizeBytes) return { ok: false, reason: 'sizeMismatch' };
  try {
    const digest = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(artifact.path)) {
      bytes += chunk.length;
      if (bytes > artifact.sizeBytes) return { ok: false, reason: 'sizeMismatch' };
      digest.update(chunk);
    }
    if (bytes !== artifact.sizeBytes) return { ok: false, reason: 'sizeMismatch' };
    const actual = digest.digest('hex');
    return actual === artifact.sha256.toLowerCase()
      ? { ok: true, sha256: actual }
      : { ok: false, reason: 'hashMismatch' };
  } catch {
    return { ok: false, reason: 'readFailed' };
  }
}
