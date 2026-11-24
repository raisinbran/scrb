import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLicenses, writeLicenses } from './generate-licenses.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(
  readFileSync(path.join(repo, 'third_party/license-catalog.json'), 'utf8'),
);
const items = [...catalog.components, ...catalog.models];
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('shipped notice inventory', () => {
  it('the generated file covers every notice package-mac.sh stages', () => {
    const script = readFileSync(path.join(repo, 'scripts/package-mac.sh'), 'utf8');
    const staged = [...script.matchAll(/^copy_license "[^"]+" (\S+)$/gm)].map((m) => m[1]);
    expect(staged.length).toBeGreaterThan(8);
    expect(
      items
        .map((i) => i.stagedAs)
        .filter(Boolean)
        .sort(),
    ).toEqual([...staged].sort());
    // Notices that live in this repository must be byte-identical to what the script copies.
    for (const m of script.matchAll(/^copy_license "\$repo\/([^"]+)" (\S+)$/gm)) {
      const item = items.find((i) => i.stagedAs === m[2]);
      expect(sha(path.join(repo, item.textFile))).toBe(sha(path.join(repo, m[1])));
    }
  });

  it('the generated file covers every notice file in the Windows packaging directory', () => {
    const dir = 'packages/transcription/licenses/windows';
    const catalogued = new Set(items.map((i) => i.textFile));
    for (const name of readdirSync(path.join(repo, dir))) {
      expect(catalogued.has(`${dir}/${name}`), name).toBe(true);
    }
  });

  it('writes a complete file with every catalog notice, the corrected pyannote and model-level texts', () => {
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'scrb-inv-')), 'licenses.json');
    try {
      writeLicenses(out);
      const list = JSON.parse(readFileSync(out, 'utf8'));
      for (const item of items) {
        expect(
          list.some((e) => e.name === item.name && e.text.length > 0),
          item.name,
        ).toBe(true);
      }
      const text = (prefix) => list.find((e) => e.name.startsWith(prefix)).text;
      expect(text('pyannote segmentation 3.0 (int8)')).toMatch(/Copyright \(c\) 2023 CNRS/);
      // The pinned sherpa-onnx tarball ships its own 2022 notice; it is kept as that artifact's text.
      expect(text('pyannote segmentation 3.0 (sherpa')).toMatch(/Copyright \(c\) 2022 CNRS/);
      expect(text('Qwen3.5')).toMatch(/Copyright 2026 Alibaba Cloud/);
      // Model entries use the model publisher's own file, never the sherpa-onnx engine license.
      for (const m of catalog.models) {
        expect(m.textFile, m.name).not.toMatch(/sherpa-onnx-LICENSE/);
      }
    } finally {
      rmSync(path.dirname(out), { recursive: true, force: true });
    }
  });

  it('fails closed when a model notice is missing', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'scrb-inv-'));
    try {
      mkdirSync(path.join(root, 'apps/desktop'), { recursive: true });
      writeFileSync(path.join(root, 'apps/desktop/package.json'), '{}');
      mkdirSync(path.join(root, 'third_party'));
      mkdirSync(path.join(root, 'scripts'));
      writeFileSync(path.join(root, 'scripts/model-digests.json'), '{"m.bin":{}}');
      writeFileSync(
        path.join(root, 'third_party/license-catalog.json'),
        JSON.stringify({
          components: [],
          models: [
            { name: 'M', version: '1', license: 'MIT', textFile: 'gone.txt', digestFile: 'm.bin' },
          ],
        }),
      );
      expect(() => generateLicenses(root)).toThrow(/M: missing license or text/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
