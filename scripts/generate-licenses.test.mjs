import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLicenses } from './generate-licenses.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temps = [];
afterEach(() => temps.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function fixture({ licenseText = true, license = 'MIT' } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scrb-genlic-'));
  temps.push(root);
  mkdirSync(path.join(root, 'apps/desktop'), { recursive: true });
  writeFileSync(
    path.join(root, 'apps/desktop/package.json'),
    JSON.stringify({ dependencies: { dep: '1.0.0' } }),
  );
  const dep = path.join(root, 'node_modules/dep');
  mkdirSync(dep, { recursive: true });
  writeFileSync(
    path.join(dep, 'package.json'),
    JSON.stringify({ name: 'dep', version: '1.0.0', license }),
  );
  if (licenseText) writeFileSync(path.join(dep, 'LICENSE'), 'dep license text');
  const electron = path.join(root, 'node_modules/electron');
  mkdirSync(electron, { recursive: true });
  writeFileSync(
    path.join(electron, 'package.json'),
    JSON.stringify({ name: 'electron', version: '1.0.0', license: 'MIT' }),
  );
  writeFileSync(path.join(electron, 'LICENSE'), 'electron text');
  mkdirSync(path.join(root, 'third_party'), { recursive: true });
  writeFileSync(
    path.join(root, 'third_party/license-catalog.json'),
    JSON.stringify({ components: [], models: [] }),
  );
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  writeFileSync(path.join(root, 'scripts/model-digests.json'), '{}');
  return root;
}

describe('generateLicenses', () => {
  it('lists every shipped dependency with name, version, license and text', () => {
    const list = generateLicenses(fixture());
    expect(list.map((e) => e.name)).toEqual(['dep', 'electron']);
    expect(list[0]).toEqual({
      name: 'dep',
      version: '1.0.0',
      license: 'MIT',
      text: 'dep license text',
    });
  });

  it('fails when a shipped dependency has no license text', () => {
    expect(() => generateLicenses(fixture({ licenseText: false }))).toThrow(
      /dep@1.0.0: no license text/,
    );
  });

  it('fails when a shipped dependency has no license identifier', () => {
    expect(() => generateLicenses(fixture({ license: '' }))).toThrow(/no license identifier/);
  });

  it('fails when a catalog component text file is missing', () => {
    const root = fixture();
    writeFileSync(
      path.join(root, 'third_party/license-catalog.json'),
      JSON.stringify({
        components: [{ name: 'x', version: '1', license: 'MIT', textFile: 'nope.txt' }],
        models: [],
      }),
    );
    expect(() => generateLicenses(root)).toThrow(/x: missing license or text/);
  });

  it('resolves the real repository: non-empty, complete, includes Electron, models and native tools', () => {
    const list = generateLicenses(repo);
    expect(list.length).toBeGreaterThan(20);
    for (const e of list) {
      expect(e.name && e.version && e.license && e.text.length).toBeTruthy();
    }
    const names = list.map((e) => e.name);
    for (const n of ['electron', 'react', 'docx', 'whisper.cpp', 'sherpa-onnx', 'llama.cpp']) {
      expect(names).toContain(n);
    }
    expect(names.some((n) => /Qwen3\.5/.test(n))).toBe(true);
  });
});
