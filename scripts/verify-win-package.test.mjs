import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyWindowsPackage } from './verify-win-package.mjs';

const temporary = [];
const tools = [
  'whisper-cli.exe',
  'whisper-server.exe',
  'whisper-vad-speech-segments.exe',
  'scrb-sherpa.exe',
  'ffmpeg.exe',
  'ffprobe.exe',
];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(slice = 2) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scrb-verify-win-package-'));
  temporary.push(root);
  const stagingDir = path.join(root, 'stage');
  const packagedDir = path.join(root, 'resources', 'bin');
  const licensesDir = path.join(stagingDir, 'licenses');
  mkdirSync(licensesDir, { recursive: true });
  mkdirSync(packagedDir, { recursive: true });

  const packageTools = slice === 3 ? [...tools, 'scrb-capture.exe'] : tools;
  const entries = [...packageTools, 'msvcp140.dll'].map((name) => {
    const bytes = `fixture:${name}`;
    writeFileSync(path.join(stagingDir, name), bytes);
    return { name, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  writeFileSync(path.join(stagingDir, 'THIRD_PARTY_NOTICES.md'), 'fixture notice');
  writeFileSync(path.join(licensesDir, 'MIT.txt'), 'fixture license');
  const licenseFiles = ['THIRD_PARTY_NOTICES.md', 'licenses/MIT.txt'];
  writeFileSync(
    path.join(stagingDir, 'PROVENANCE.json'),
    JSON.stringify({
      stagedFiles: entries,
      licenseFiles,
      sources:
        slice === 3
          ? {
              capture: {
                architecture: 'x64',
                sourceCommit: 'a'.repeat(40),
                sourceFileCommit: 'b'.repeat(40),
                sourceTreeSha256: 'c'.repeat(64),
                opusSourceCommit: 'd'.repeat(40),
                opusLibrarySha256: 'e'.repeat(64),
                runtimePolicy: 'MSVC /MD',
              },
            }
          : {},
    }),
  );
  writeFileSync(path.join(stagingDir, 'DEPENDENCY-AUDIT.json'), JSON.stringify({ files: entries }));
  cpSync(stagingDir, packagedDir, { recursive: true });
  return { stagingDir, packagedDir };
}

describe('verify-win-package', () => {
  it('accepts a complete packaged slice-2 tool, DLL, provenance and license set', () => {
    const config = fixture();
    expect(verifyWindowsPackage({ ...config, slice: 2 })).toEqual({
      executableCount: 6,
      dllCount: 1,
      licenseFileCount: 2,
    });
  });

  it('fails when a required tool is missing from packaged resources/bin', () => {
    const config = fixture();
    rmSync(path.join(config.packagedDir, 'ffprobe.exe'));
    expect(() => verifyWindowsPackage({ ...config, slice: 2 })).toThrow(
      /packaged resources\/bin executable\/DLL set mismatch/,
    );
  });

  it('fails when a packaged DLL hash differs from the staged provenance', () => {
    const config = fixture();
    writeFileSync(path.join(config.packagedDir, 'msvcp140.dll'), 'altered runtime');
    expect(() => verifyWindowsPackage({ ...config, slice: 2 })).toThrow(
      /packaged resources\/bin hash mismatch for msvcp140\.dll/,
    );
  });

  it('rejects an unexpected executable in the slice-2 staging manifest', () => {
    const config = fixture();
    const extraTool = 'scrb-capture.exe';
    const bytes = `fixture:${extraTool}`;
    writeFileSync(path.join(config.stagingDir, extraTool), bytes);
    const provenancePath = path.join(config.stagingDir, 'PROVENANCE.json');
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    provenance.stagedFiles.push({
      name: extraTool,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    writeFileSync(provenancePath, JSON.stringify(provenance));
    const auditPath = path.join(config.stagingDir, 'DEPENDENCY-AUDIT.json');
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    audit.files.push(provenance.stagedFiles.at(-1));
    writeFileSync(auditPath, JSON.stringify(audit));

    expect(() => verifyWindowsPackage({ ...config, slice: 2 })).toThrow(
      /staging required executable set mismatch/,
    );
  });

  it('accepts a seven-tool package with capture source and runtime provenance', () => {
    const config = fixture(3);
    expect(verifyWindowsPackage({ ...config, slice: 3 })).toEqual({
      executableCount: 7,
      dllCount: 1,
      licenseFileCount: 2,
    });
  });

  it('rejects a slice-3 package without source-compatible helper provenance', () => {
    const config = fixture(3);
    const provenancePath = path.join(config.stagingDir, 'PROVENANCE.json');
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    delete provenance.sources.capture;
    writeFileSync(provenancePath, JSON.stringify(provenance));
    const packagedPath = path.join(config.packagedDir, 'PROVENANCE.json');
    writeFileSync(packagedPath, JSON.stringify(provenance));
    expect(() => verifyWindowsPackage({ ...config, slice: 3 })).toThrow(
      /capture helper provenance is missing/,
    );
  });
});
