// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appInfo, createAppInfoHandler } from './app-info.ts';
import {
  MODELS,
  SUMMARY_MODEL,
  listModelRows,
  listSummaryRow,
  type DigestTable,
} from './packaged-setup.ts';
import { readVerifiedConfiguredModels } from './setup-status.ts';

describe('real getAppInfo model inventory', () => {
  let root: string;
  let models: string;
  let cache: string;
  let table: DigestTable;
  const rows = [...MODELS, SUMMARY_MODEL];
  const contents = (index: number) => Buffer.from(`invented model ${index}`);
  const put = (index: number, bytes: Buffer = contents(index)) =>
    writeFileSync(join(models, rows[index]!.file), bytes);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scrb-about-'));
    models = join(root, 'models');
    cache = join(root, 'verified.json');
    mkdirSync(models);
    table = {};
    rows.forEach((row, index) => {
      const bytes = contents(index);
      table[row.file] = {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      };
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // This is the handler installed by backend.ts with the actual packaged model verifier,
  // not the UI mock or an assertion over fake installed flags.
  const packagedHandler = () =>
    createAppInfoHandler({
      getName: () => 'Scribe',
      getVersion: () => '0.1.0',
      readVerifiedModels: async () => [
        ...(await listModelRows(models, cache, table)),
        await listSummaryRow(models, cache, table),
      ],
    });

  it('reports complete verified speech, speaker and summary models with no invented build date', async () => {
    rows.forEach((_, i) => put(i));
    const result = await packagedHandler()();
    expect(result).toMatchObject({
      name: 'Scribe',
      version: '0.1.0',
      buildDate: 'Not recorded',
    });
    expect(result.models.map((model) => model.role)).toEqual([
      'liveSpeech',
      'finalSpeech',
      'speaker',
      'summary',
    ]);
    expect(result.models.every((model) => model.installed)).toBe(true);
    expect(result.models.find((model) => model.role === 'speaker')?.version).toContain(
      MODELS[4]!.file,
    );
    expect(result.models.find((model) => model.role === 'summary')?.version).toBe(
      SUMMARY_MODEL.file,
    );
  });

  it('reports only verified files in a partial installation, not a part or wrong-hash model', async () => {
    put(1);
    put(3);
    put(5, Buffer.from('invented modeX 5')); // Same size, wrong SHA-256.
    writeFileSync(join(models, `${MODELS[0]!.file}.part`), contents(0));
    const result = await packagedHandler()();
    expect(result.models.map((model) => model.role)).toEqual(['liveSpeech', 'speaker']);
    expect(result.models.find((model) => model.role === 'liveSpeech')?.version).toBe(
      MODELS[1]!.file,
    );
    expect(result.models.find((model) => model.role === 'speaker')?.version).toBe(MODELS[3]!.file);
    expect(result.models.some((model) => model.role === 'summary')).toBe(false);
  });

  it('reports no installed models when none verifies', async () => {
    expect((await packagedHandler()()).models).toEqual([]);
    expect(appInfo('Scribe', '0.1.0', []).buildDate).toBe('Not recorded');
  });

  it('invalidates an attestation when an installed model changes at the same size', async () => {
    put(0);
    const handler = packagedHandler();
    expect((await handler()).models[0]?.version).toBe(MODELS[0]!.file);
    put(0, Buffer.from('invented modeX 0'));
    const later = new Date(Date.now() + 10_000);
    utimesSync(join(models, MODELS[0]!.file), later, later);
    expect((await handler()).models).toEqual([]);
  });

  it('uses only explicitly configured and digest-verified development models', async () => {
    put(0);
    put(1);
    put(3);
    put(4);
    put(5);
    const live = join(root, 'live.json');
    const final = join(root, 'final.json');
    writeFileSync(
      live,
      JSON.stringify({
        models: {
          speechLive: join(models, MODELS[1]!.file),
          vad: join(models, MODELS[2]!.file), // Missing: must not appear.
        },
      }),
    );
    writeFileSync(
      final,
      JSON.stringify({
        models: {
          speechFinal: join(models, MODELS[0]!.file),
          segmentation: join(models, MODELS[3]!.file),
          embedding: join(models, MODELS[4]!.file),
          summary: join(models, SUMMARY_MODEL.file),
        },
      }),
    );
    const handler = createAppInfoHandler({
      getName: () => 'Scribe',
      getVersion: () => '0.1.0',
      readVerifiedModels: () =>
        readVerifiedConfiguredModels({
          finalPassConfig: final,
          liveConfig: live,
          cacheFile: cache,
          digests: table,
        }),
    });
    expect((await handler()).models.map((model) => model.role)).toEqual([
      'liveSpeech',
      'finalSpeech',
      'speaker',
      'summary',
    ]);
    rmSync(join(models, MODELS[4]!.file));
    const partial = await handler();
    expect(partial.models.find((model) => model.role === 'speaker')?.version).toBe(MODELS[3]!.file);
    expect(partial.models.some((model) => model.version.includes(MODELS[4]!.file))).toBe(false);
  });
});
