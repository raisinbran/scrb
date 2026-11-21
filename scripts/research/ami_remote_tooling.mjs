// Resolve existing research-tool binaries without launching or downloading them.
// The Mac stage uses extensionless programs and lib/*.dylib; Windows uses *.exe.
import { lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertStrictChild } from './ami_remote_workspace.mjs';

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

export async function verifyAmiResearchToolPaths({ toolRoot, whisperBin, toolPaths }) {
  const toolBase = await realpath(resolve(toolRoot));
  const whisperBase = await realpath(resolve(whisperBin));
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
