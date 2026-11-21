import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeCandidateManifest, verifyCandidateManifest } from './win-installer-candidate-manifest.mjs';

const directories = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scrb-win-installer-candidate-'));
  directories.push(root);
  const stage = path.join(root, 'stage');
  mkdirSync(stage);
  const opts = {
    installerPath: path.join(root, 'Scribe Setup 0.1.0.exe'),
    applicationPath: path.join(root, 'Scribe.exe'),
    provenancePath: path.join(stage, 'PROVENANCE.json'),
    auditPath: path.join(stage, 'DEPENDENCY-AUDIT.json'),
    sourceCommit: 'a'.repeat(40),
  };
  writeFileSync(opts.installerPath, 'invented installer bytes');
  writeFileSync(opts.applicationPath, 'invented app bytes');
  writeFileSync(opts.provenancePath, '{"source":"invented"}');
  writeFileSync(opts.auditPath, '{"stage":"invented"}');
  return { root, opts };
}

describe('Windows installer candidate provenance', () => {
  it('binds installer, application, stage reports and exact source commit', async () => {
    const { opts } = fixture();
    const manifest = await makeCandidateManifest(opts);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.installMode).toBe('perUser');
    expect(manifest.installer.name).toBe('Scribe Setup 0.1.0.exe');
    expect(manifest.application.name).toBe('Scribe.exe');
    expect(manifest.provenance.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyCandidateManifest(manifest, opts)).resolves.toEqual(manifest);
  });

  it('rejects an installer modified after its manifest was recorded', async () => {
    const { opts } = fixture();
    const manifest = await makeCandidateManifest(opts);
    writeFileSync(opts.installerPath, 'different invented installer bytes');
    await expect(verifyCandidateManifest(manifest, opts)).rejects.toThrow('candidate manifest differs');
  });

  it('rejects a staged provenance or prepackaged application replaced after hashing', async () => {
    const { opts } = fixture();
    const manifest = await makeCandidateManifest(opts);
    writeFileSync(opts.provenancePath, '{"source":"tampered"}');
    await expect(verifyCandidateManifest(manifest, opts)).rejects.toThrow('candidate manifest differs');
    writeFileSync(opts.provenancePath, '{"source":"invented"}');
    writeFileSync(opts.applicationPath, 'another executable');
    await expect(verifyCandidateManifest(manifest, opts)).rejects.toThrow('candidate manifest differs');
  });

  it('rejects a wrong source identity, invalid artifact schema, and symlinked binaries', async () => {
    const { root, opts } = fixture();
    const manifest = await makeCandidateManifest(opts);
    await expect(verifyCandidateManifest(manifest, { ...opts, sourceCommit: 'b'.repeat(40) })).rejects.toThrow('candidate manifest differs');
    await expect(verifyCandidateManifest({ ...manifest, schemaVersion: 2 }, opts)).rejects.toThrow('schema');
    await expect(verifyCandidateManifest({ ...manifest, installMode: 'perMachine' }, opts)).rejects.toThrow('per-user');
    const symlink = path.join(root, 'symlink.exe');
    symlinkSync(opts.applicationPath, symlink);
    await expect(makeCandidateManifest({ ...opts, applicationPath: symlink })).rejects.toThrow('regular file');
  });

  it('fails closed if required stage files or the current source commit are absent', async () => {
    const { opts } = fixture();
    rmSync(opts.auditPath);
    await expect(makeCandidateManifest(opts)).rejects.toThrow();
    await expect(makeCandidateManifest({ ...opts, sourceCommit: 'not-a-commit' })).rejects.toThrow('source commit');
  });
});
