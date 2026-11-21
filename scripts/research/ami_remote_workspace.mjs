// All temporary paths in the AMI evaluation are created exclusively below SCRB_BIN.
// Never construct a final-pass work directory from untrusted command-line input.
import { lstat, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
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
export async function createAmiWorkspace({ assets, bin, meeting, scratch }) {
  const id = requireAmiMeetingId(meeting); // Validate before touching any filesystem path.
  const assetRoot = await realpath(resolve(assets));
  const toolRoot = await realpath(resolve(bin));
  const ami = assertStrictChild(assetRoot, await realpath(join(assetRoot, 'downloads', 'ami')));
  const sourceFile = join(ami, id + '.Mix-Headset.wav');
  // Do not follow an AMI source symlink: it could access a private file outside the corpus.
  if (!(await lstat(sourceFile)).isFile()) throw new Error('AMI source must be a regular file');
  const sourceWav = assertStrictChild(ami, await realpath(sourceFile));
  // An explicitly selected scratch directory keeps writes out of a packaged Mac bin.
  const requestedScratch = scratch ? resolve(scratch) : toolRoot;
  if (scratch && !(await lstat(requestedScratch)).isDirectory()) {
    throw new Error('AMI scratch root must be a real directory');
  }
  const scratchRoot = await realpath(requestedScratch);
  const runRoot = await mkdtemp(join(scratchRoot, 'scrb-ami-eval-'));
  try {
    const workDir = await mkdtemp(join(runRoot, 'final-pass-'));
    const wav = assertStrictChild(runRoot, join(runRoot, 'clip.wav'));
    assertStrictChild(runRoot, workDir);
    return {
      ami,
      toolRoot,
      assetRoot,
      scratchRoot,
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


/** Read only regular AMI segment annotation files contained by the canonical corpus. */
export async function readAmiSegmentAnnotations(ami, meeting) {
  const id = requireAmiMeetingId(meeting);
  const canonicalAmi = await realpath(resolve(ami));
  const segmentsPath = join(canonicalAmi, 'ann', 'segments');
  const segmentsStat = await lstat(segmentsPath);
  if (!segmentsStat.isDirectory()) throw new Error('AMI annotation directory must be a real directory');
  const segmentsRoot = assertStrictChild(canonicalAmi, await realpath(segmentsPath));
  const rows = [];
  for (const file of await readdir(segmentsRoot)) {
    const match = file.match(new RegExp('^' + id + '\\.([^.\\\\/]+)\\.segments\\.xml$'));
    if (!match) continue;
    const path = join(segmentsRoot, file);
    const stat = await lstat(path);
    if (!stat.isFile()) throw new Error('AMI annotation must be a regular file');
    const canonicalFile = assertStrictChild(segmentsRoot, await realpath(path));
    const bytes = await readFile(canonicalFile);
    rows.push({ file, speaker: match[1], bytes, xml: bytes.toString('utf8') });
  }
  if (rows.length === 0) throw new Error('no AMI segment annotations found for meeting');
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}


/** Return every regular DLL directly beside a packaged executable, rejecting symlinks. */
export async function collectAdjacentDlls(root) {
  const canonicalRoot = await realpath(resolve(root));
  if (!(await lstat(canonicalRoot)).isDirectory()) {
    throw new Error('tool directory must be a real directory');
  }
  const dlls = {};
  for (const entry of await readdir(canonicalRoot, { withFileTypes: true })) {
    if (!/\.dll$/i.test(entry.name)) continue;
    const path = join(canonicalRoot, entry.name);
    if (!(await lstat(path)).isFile()) throw new Error('runtime DLL must be a regular file');
    dlls['runtimeDll:' + entry.name] = assertStrictChild(canonicalRoot, await realpath(path));
  }
  return dlls;
}

/** Hash adjacent bundled Mac dylibs (including lib/), without following links. */
export async function collectResearchRuntimeLibraries(root, platform) {
  if (platform === 'win32') return collectAdjacentDlls(root);
  if (platform !== 'darwin') throw new Error('research libraries support macOS or Windows');
  const canonicalRoot = await realpath(resolve(root));
  if (!(await lstat(canonicalRoot)).isDirectory()) {
    throw new Error('tool directory must be a real directory');
  }
  const found = {};
  for (const [folder, prefix] of [[canonicalRoot, ''], [join(canonicalRoot, 'lib'), 'lib/']]) {
    let folderStat;
    try {
      folderStat = await lstat(folder);
    } catch (error) {
      if (prefix && error?.code === 'ENOENT') continue;
      throw error;
    }
    if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) {
      throw new Error('runtime dylib directory must be a real directory');
    }
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (!/\.dylib$/i.test(entry.name)) continue;
      const file = join(folder, entry.name);
      if (!(await lstat(file)).isFile()) {
        throw new Error('runtime dylib must be a regular file');
      }
      found['runtimeDylib:' + prefix + entry.name] = assertStrictChild(
        canonicalRoot,
        await realpath(file),
      );
    }
  }
  return found;
}
