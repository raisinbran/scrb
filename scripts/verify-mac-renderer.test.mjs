import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyMacRenderer } from './verify-mac-renderer.mjs';

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function rendererPair(sourceJs = 'Copy transcript', packagedJs = sourceJs) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scrb-mac-renderer-'));
  temporary.push(root);
  const source = path.join(root, 'source');
  const packaged = path.join(root, 'packaged');
  for (const directory of [source, packaged])
    mkdirSync(path.join(directory, 'assets'), { recursive: true });
  writeFileSync(path.join(source, 'index.html'), '<script src="assets/app.js"></script>');
  writeFileSync(path.join(packaged, 'index.html'), '<script src="assets/app.js"></script>');
  writeFileSync(path.join(source, 'assets/app.js'), sourceJs);
  writeFileSync(path.join(packaged, 'assets/app.js'), packagedJs);
  return [source, packaged];
}

describe('Mac packaged renderer verification', () => {
  it('accepts an exact package containing the Copy action', () => {
    expect(() => verifyMacRenderer(...rendererPair())).not.toThrow();
  });

  it('rejects a stale package even when source metadata claims the right commit', () => {
    const [source, packaged] = rendererPair('Copy transcript', 'older renderer without action');
    expect(() => verifyMacRenderer(source, packaged)).toThrow(/differs from freshly built dist/);
  });

  it('rejects a matching renderer that lacks the Copy action', () => {
    const [source, packaged] = rendererPair('Export', 'Export');
    expect(() => verifyMacRenderer(source, packaged)).toThrow(/missing the Copy transcript action/);
  });
});
