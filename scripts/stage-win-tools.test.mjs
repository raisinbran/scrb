import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CAPTURE_TOOL,
  parseDumpbinArchitecture,
  parseDumpbinDependencies,
  REQUIRED_TOOLS,
  stageWindowsTools,
} from './stage-win-tools.mjs';

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scrb-stage-win-tools-'));
  temporary.push(root);
  const whisper = path.join(root, 'whisper');
  const sherpa = path.join(root, 'sherpa');
  const ffmpeg = path.join(root, 'ffmpeg');
  const runtime = path.join(root, 'runtime');
  const system32 = path.join(root, 'system32');
  const licenses = path.join(root, 'licenses');
  for (const directory of [whisper, sherpa, ffmpeg, runtime, system32, licenses]) {
    mkdirSync(directory);
  }

  const toolSources = Object.fromEntries(
    REQUIRED_TOOLS.map((name) => {
      const directory = name.startsWith('whisper-')
        ? whisper
        : name === 'scrb-sherpa.exe'
          ? sherpa
          : ffmpeg;
      const source = path.join(directory, name);
      writeFileSync(source, `tool:${name}`);
      return [name, source];
    }),
  );
  writeFileSync(path.join(whisper, 'whisper.dll'), 'whisper runtime');
  writeFileSync(path.join(whisper, 'ggml.dll'), 'ggml runtime');
  writeFileSync(path.join(sherpa, 'sherpa-onnx-c-api.dll'), 'sherpa runtime');
  writeFileSync(path.join(sherpa, 'onnxruntime.dll'), 'onnx runtime');
  writeFileSync(path.join(runtime, 'msvcp140.dll'), 'msvc runtime');
  writeFileSync(path.join(system32, 'kernel32.dll'), 'windows api');
  writeFileSync(path.join(licenses, 'MIT.txt'), 'MIT license fixture');
  const notices = path.join(root, 'THIRD_PARTY_NOTICES.md');
  writeFileSync(notices, 'fixture notices');

  const dependencies = {
    'whisper-cli.exe': ['whisper.dll', 'MSVCP140.dll', 'kernel32.dll'],
    'whisper-server.exe': ['whisper.dll', 'MSVCP140.dll'],
    'whisper-vad-speech-segments.exe': ['whisper.dll'],
    'whisper.dll': ['ggml.dll'],
    'ggml.dll': ['kernel32.dll'],
    'scrb-sherpa.exe': ['sherpa-onnx-c-api.dll'],
    'sherpa-onnx-c-api.dll': ['onnxruntime.dll', 'MSVCP140.dll'],
  };
  const inspectDependencies = (file) => dependencies[path.basename(file)] ?? [];

  return {
    root,
    outputDir: path.join(root, 'stage', 'bin'),
    toolSources,
    sourceDirectories: [runtime, whisper, sherpa, ffmpeg],
    system32Path: system32,
    inspectDependencies,
    pinnedRuntimeHashes: {
      'msvcp140.dll': createHash('sha256').update('msvc runtime').digest('hex'),
    },
    noticesPath: notices,
    licensesDirectory: licenses,
    provenance: { fixture: true },
  };
}

describe('stage-win-tools', () => {
  it('parses DLL imports from dumpbin output', () => {
    expect(
      parseDumpbinDependencies(
        'Image has the following dependencies:\r\n  KERNEL32.dll\r\n  whisper.dll\r\n  \r\n',
      ),
    ).toEqual(['KERNEL32.dll', 'whisper.dll']);
  });

  it('identifies the capture helper architecture from dumpbin headers', () => {
    expect(parseDumpbinArchitecture('FILE HEADER VALUES\r\n  8664 machine (x64)\r\n')).toBe('x64');
    expect(parseDumpbinArchitecture('FILE HEADER VALUES\r\n  14c machine (x86)\r\n')).toBe('x86');
    expect(parseDumpbinArchitecture('no machine header')).toBeUndefined();
  });

  it('copies six tools and recursively stages their non-system DLLs and notices', () => {
    const config = fixture();
    let verified = false;
    const audit = stageWindowsTools({
      ...config,
      verifyTools: (directory, system32) => {
        expect(directory).toBe(path.resolve(config.outputDir));
        expect(system32).toBe(config.system32Path);
        for (const name of REQUIRED_TOOLS)
          expect(existsSync(path.join(directory, name))).toBe(true);
        verified = true;
      },
    });

    expect(verified).toBe(true);
    expect(audit.files.filter((file) => file.name.endsWith('.exe'))).toHaveLength(6);
    const stagedNames = audit.files.map((file) => file.name.toLowerCase());
    expect(stagedNames).toContain('ggml.dll');
    expect(stagedNames).toContain('msvcp140.dll');
    expect(stagedNames).toContain('onnxruntime.dll');
    expect(audit.systemDependencies).toContain('kernel32.dll');
    expect(
      audit.dependencyEdges.some(
        (edge) => edge.from === 'ggml.dll' && edge.resolution === 'System32',
      ),
    ).toBe(true);
  });

  it('stages the source-identified capture helper and audits its runtime closure', () => {
    const config = fixture();
    const captureDirectory = path.join(config.root, 'capture');
    mkdirSync(captureDirectory);
    const capturePath = path.join(captureDirectory, CAPTURE_TOOL);
    writeFileSync(capturePath, 'capture helper fixture');
    config.toolSources[CAPTURE_TOOL] = capturePath;
    config.sourceDirectories.push(captureDirectory);
    const inspectBase = config.inspectDependencies;
    config.inspectDependencies = (file) =>
      path.basename(file) === CAPTURE_TOOL ? ['MSVCP140.dll', 'kernel32.dll'] : inspectBase(file);
    let verified = false;

    const audit = stageWindowsTools({
      ...config,
      includeCapture: true,
      captureProvenance: {
        sourceCommit: 'a'.repeat(40),
        sourceTreeSha256: 'b'.repeat(64),
        opusSourceCommit: 'c'.repeat(40),
        opusLibrarySha256: 'd'.repeat(64),
      },
      verifyTools: (directory) => {
        expect(existsSync(path.join(directory, CAPTURE_TOOL))).toBe(true);
        verified = true;
      },
    });

    expect(verified).toBe(true);
    expect(audit.files.filter((file) => file.name.endsWith('.exe'))).toHaveLength(7);
    expect(
      audit.dependencyEdges.some(
        (edge) => edge.from === CAPTURE_TOOL && edge.dependency === 'MSVCP140.dll',
      ),
    ).toBe(true);
  });

  it('requires source provenance when staging the capture helper', () => {
    const config = fixture();
    const capturePath = path.join(config.root, CAPTURE_TOOL);
    writeFileSync(capturePath, 'capture helper fixture');
    config.toolSources[CAPTURE_TOOL] = capturePath;
    expect(() => stageWindowsTools({ ...config, includeCapture: true })).toThrow(
      /capture source provenance is required/,
    );
  });

  it('fails when a required tool is missing', () => {
    const config = fixture();
    delete config.toolSources['ffprobe.exe'];
    expect(() => stageWindowsTools({ ...config, verifyTools: () => {} })).toThrow(
      /missing required tool ffprobe\.exe/,
    );
  });

  it('fails closed when a non-system DLL is absent, even if Windows has that name', () => {
    const config = fixture();
    rmSync(path.join(config.sourceDirectories[0], 'msvcp140.dll'));
    writeFileSync(path.join(config.system32Path, 'msvcp140.dll'), 'system copy');
    expect(() => stageWindowsTools({ ...config, verifyTools: () => {} })).toThrow(
      /cannot locate non-system dependency MSVCP140\.dll/,
    );
  });

  it('rejects an MSVC runtime DLL that does not match its pinned hash', () => {
    const config = fixture();
    writeFileSync(path.join(config.sourceDirectories[0], 'msvcp140.dll'), 'unexpected runtime');
    expect(() => stageWindowsTools({ ...config, verifyTools: () => {} })).toThrow(
      /MSVC runtime hash mismatch for MSVCP140\.dll/,
    );
  });

  it('preserves and rejects a non-empty output directory', () => {
    const config = fixture();
    mkdirSync(config.outputDir, { recursive: true });
    const sentinel = path.join(config.outputDir, 'keep.txt');
    writeFileSync(sentinel, 'preserve');
    expect(() => stageWindowsTools({ ...config, verifyTools: () => {} })).toThrow(
      /refusing to overwrite non-empty staging directory/,
    );
    expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
  });
});
