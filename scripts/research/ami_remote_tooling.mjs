// Resolve existing research-tool binaries without launching or downloading them.
// The Mac stage uses extensionless programs and lib/*.dylib; Windows uses *.exe.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { assertStrictChild, collectResearchRuntimeLibraries } from './ami_remote_workspace.mjs';

export function resolveAmiResearchToolPaths({ platform, assetRoot, toolRoot }) {
  if (platform !== 'darwin' && platform !== 'win32') {
    throw new Error('AMI research supports only macOS or Windows');
  }
  if (!assetRoot || !toolRoot) throw new Error('research asset and tool roots are required');
  const suffix = platform === 'win32' ? '.exe' : '';
  const tools = resolve(toolRoot);
  // The verified macOS bundle stages Whisper beside FFmpeg and Sherpa.
  // Preserve the Windows research runner's existing upstream Whisper layout.
  const whisperBin =
    platform === 'darwin'
      ? tools
      : join(resolve(assetRoot), 'upstream', 'whisper.cpp', 'build', 'bin');
  const binary = (name) => name + suffix;
  return {
    whisperBin,
    toolPaths: {
      ffmpeg: join(tools, binary('ffmpeg')),
      ffprobe: join(tools, binary('ffprobe')),
      whisperCli: join(whisperBin, binary('whisper-cli')),
      whisperServer: join(whisperBin, binary('whisper-server')),
      whisperVad: join(whisperBin, binary('whisper-vad-speech-segments')),
      sherpaSidecar: join(tools, binary('scrb-sherpa')),
    },
  };
}

export async function verifyAmiResearchToolPaths({
  platform,
  assetRoot,
  toolRoot,
  whisperBin,
  toolPaths,
}) {
  if (platform !== 'darwin' && platform !== 'win32') {
    throw new Error('AMI research supports only macOS or Windows');
  }
  const toolBase = await realpath(resolve(toolRoot));
  const whisperBase = await realpath(resolve(whisperBin));
  if (platform === 'win32') {
    // A linked upstream/whisper.cpp or build/bin ancestor must not redirect
    // the native Whisper binaries outside the approved public assets root.
    const assetBase = await realpath(resolve(assetRoot));
    assertStrictChild(assetBase, whisperBase);
  } else if (whisperBase !== toolBase) {
    throw new Error('Mac Whisper tools must share the verified runtime bundle');
  }
  for (const [name, file] of Object.entries(toolPaths)) {
    let stat;
    try {
      stat = await lstat(file);
    } catch {
      throw new Error('missing research executable: ' + name);
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('research executable must be a regular file: ' + name);
    }
    const root = name.startsWith('whisper') ? whisperBase : toolBase;
    assertStrictChild(root, await realpath(file));
  }
}

// On macOS a staged package can carry DEPENDENCY-AUDIT.json. If supplied,
// verify its complete staged file list before any native executable runs.
// This enforces internal staged-bundle consistency, not independent signing.
async function verifyOptionalMacAudit(platform, toolRoot, toolPaths, libraries) {
  if (platform !== 'darwin') return;
  const base = await realpath(resolve(toolRoot));
  const auditPath = join(base, 'DEPENDENCY-AUDIT.json');
  let stat;
  try {
    stat = await lstat(auditPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('research Mac dependency audit must be a regular file');
  }
  const audit = JSON.parse(await readFile(auditPath, 'utf8'));
  if (audit.schemaVersion !== 1 || !Array.isArray(audit.files)) {
    throw new Error('research Mac dependency audit has an invalid staged file list');
  }
  const seen = new Set();
  for (const entry of audit.files) {
    if (
      typeof entry.name !== 'string' ||
      !/^(?:lib\/)?[A-Za-z0-9._+-]+$/.test(entry.name) ||
      entry.name === '.' ||
      entry.name === '..' ||
      !/^[a-f0-9]{64}$/i.test(entry.stagedSha256 ?? '') ||
      seen.has(entry.name)
    ) {
      throw new Error('invalid or duplicate Mac audit entry');
    }
    seen.add(entry.name);
    const file = join(base, ...entry.name.split('/'));
    if (!(await lstat(file)).isFile()) {
      throw new Error('Mac audit input must be a regular file: ' + entry.name);
    }
    const canonicalFile = assertStrictChild(base, await realpath(file));
    const actual = createHash('sha256').update(await readFile(canonicalFile)).digest('hex');
    if (actual !== entry.stagedSha256.toLowerCase()) {
      throw new Error('Mac runtime audit hash mismatch: ' + entry.name);
    }
  }
  for (const file of [...Object.values(toolPaths), ...Object.values(libraries)]) {
    // macOS can spell the same directory /var/... or /private/var/....
    // Resolve both operands before comparing them, without weakening
    // the strict tool-bundle containment check.
    const canonicalFile = assertStrictChild(base, await realpath(file));
    const name = relative(base, canonicalFile).split(sep).join('/');
    if (!seen.has(name)) throw new Error('Mac audit is missing a runtime input: ' + name);
  }
}

/** Preflight all native inputs, then invoke the supplied launch callback. */
export async function withVerifiedAmiResearchRuntime(options, launch) {
  if (typeof launch !== 'function') throw new Error('research launch callback is required');
  await verifyAmiResearchToolPaths(options);
  const toolLibraries = await collectResearchRuntimeLibraries(options.toolRoot, options.platform);
  const whisperLibraries = await collectResearchRuntimeLibraries(options.whisperBin, options.platform);
  await verifyOptionalMacAudit(options.platform, options.toolRoot, options.toolPaths, {
    ...toolLibraries,
    ...whisperLibraries,
  });
  return launch({ toolLibraries, whisperLibraries });
}
