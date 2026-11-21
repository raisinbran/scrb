// All temporary paths in the AMI evaluation are created exclusively below SCRB_BIN.
// Never construct a final-pass work directory from untrusted command-line input.
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function requireAmiMeetingId(value) {
  if (typeof value !== 'string' || !/^[A-Z]{2}[0-9]{4}[a-z]$/.test(value)) {
    throw new Error('meeting must be a plain AMI ID such as ES2004a');
  }
  return value;
}

export function assertStrictChild(root, candidate) {
  const rel = relative(root, candidate);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('path escapes its assigned directory');
  }
  return candidate;
}

/** Both generated audio and runFinalPass's recursively deleted workDir are owned by root. */
export async function createAmiWorkspace({ assets, bin, meeting }) {
  const id = requireAmiMeetingId(meeting); // Validate before touching any filesystem path.
  const assetRoot = await realpath(resolve(assets));
  const toolRoot = await realpath(resolve(bin));
  const ami = assertStrictChild(assetRoot, await realpath(join(assetRoot, 'downloads', 'ami')));
  const sourceFile = join(ami, id + '.Mix-Headset.wav');
  // Do not follow an AMI source symlink: it could access a private file outside the corpus.
  if (!(await lstat(sourceFile)).isFile()) throw new Error('AMI source must be a regular file');
  const sourceWav = assertStrictChild(ami, await realpath(sourceFile));
  const runRoot = await mkdtemp(join(toolRoot, 'scrb-ami-eval-'));
  try {
    const workDir = await mkdtemp(join(runRoot, 'final-pass-'));
    const wav = assertStrictChild(runRoot, join(runRoot, 'clip.wav'));
    assertStrictChild(runRoot, workDir);
    return {
      ami,
      toolRoot,
      assetRoot,
      sourceWav,
      workDir,
      wav,
      runRoot,
      // Only the exclusively created runRoot is ever recursively cleaned by this runner.
      cleanup: () => rm(runRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(runRoot, { recursive: true, force: true });
    throw error;
  }
}
