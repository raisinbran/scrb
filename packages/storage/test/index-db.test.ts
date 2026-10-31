import { readdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openIndex } from '../src/db/database.ts';
import { INDEX_VERSION, MIGRATIONS, migrate, readIndexVersion } from '../src/db/migrations.ts';
import { getMeetingRow, upsertMeeting } from '../src/db/meetings-index.ts';
import { SettingsStore } from '../src/db/settings.ts';
import { VocabularyStore } from '../src/db/vocabulary.ts';
import { VoiceProfileStore } from '../src/db/voice-profiles.ts';
import { UnsupportedVersionError } from '../src/errors.ts';
import type { MeetingMeta } from '../src/formats/meeting.ts';
import { tempDir } from './helpers.ts';

const now = (): string => '2026-10-30T00:00:00.000Z';

function meta(id: string): MeetingMeta {
  return {
    schemaVersion: 1,
    id,
    title: 'Project sync',
    date: '2026-10-28',
    createdAt: '2026-10-28T10:00:00.000Z',
    durationMs: 1000,
    source: 'recorded',
    status: 'ready',
    audioDeletedAt: null,
    buildVoiceProfiles: false,
  };
}

function tables(db: DatabaseSync): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as unknown as { name: string }[];
  return rows.map((row) => row.name);
}

describe('index migrations', () => {
  it.each(Array.from({ length: INDEX_VERSION }, (_, version) => version))(
    'upgrades a real index from version %i to the latest',
    async (start) => {
      const file = path.join(await tempDir(), 'index.sqlite');
      const old = new DatabaseSync(file);
      migrate(old, MIGRATIONS, start);
      expect(readIndexVersion(old)).toBe(start);
      if (start >= 1) {
        old
          .prepare(
            `INSERT INTO meetings (id, folder, title, date, created_at, duration_ms, source, status)
             VALUES ('m1', 'f', 'Kept title', '2026-01-01', 'x', 5, 'recorded', 'ready')`,
          )
          .run();
      }
      if (start >= 2) {
        old.prepare(`INSERT INTO settings VALUES ('theme', '"dark"')`).run();
      }
      old.close();

      const { db } = await openIndex(file);
      expect(readIndexVersion(db)).toBe(INDEX_VERSION);
      expect(tables(db)).toEqual(
        expect.arrayContaining(['meetings', 'settings', 'vocabulary_terms', 'voice_profiles']),
      );
      if (start >= 1) {
        expect(getMeetingRow(db, 'm1')).toMatchObject({ title: 'Kept title', audioDeletedAt: null });
      }
      if (start >= 2) expect(new SettingsStore(db).get('theme', 'light')).toBe('dark');
      db.close();
    },
  );

  it('rolls a failing step back and keeps the last good version', async () => {
    const db = new DatabaseSync(':memory:');
    const steps = ['CREATE TABLE one (a)', 'CREATE TABLE two (a); THIS IS NOT SQL'];
    expect(() => migrate(db, steps)).toThrow();
    expect(readIndexVersion(db)).toBe(1);
    expect(tables(db)).toEqual(['one']);
    migrate(db, ['CREATE TABLE one (a)', 'CREATE TABLE two (a)']);
    expect(readIndexVersion(db)).toBe(2);
  });

  it('refuses an index from a newer build and leaves it alone', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version = ${INDEX_VERSION + 1}`);
    db.close();
    await expect(openIndex(file)).rejects.toBeInstanceOf(UnsupportedVersionError);
    const check = new DatabaseSync(file);
    expect(readIndexVersion(check)).toBe(INDEX_VERSION + 1);
    check.close();
  });

  it('preserves a corrupt index instead of silently rebuilding index-only data', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const broken = 'this is not a database, it just has enough bytes to be read as one';
    await writeFile(file, broken);
    await expect(openIndex(file)).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe(broken);
  });

  it('cleans up verified upgrade snapshots after successful migration', async () => {
    const root = await tempDir();
    const file = path.join(root, 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 2);
    old.prepare(`INSERT INTO settings VALUES ('theme', '"dark"')`).run();
    old.close();
    const { db } = await openIndex(file);
    expect(readIndexVersion(db)).toBe(INDEX_VERSION);
    expect(new SettingsStore(db).get('theme', 'light')).toBe('dark');
    db.close();
    expect((await readdir(root)).filter((name) => name.includes('.upgrade-'))).toEqual([]);
  });

  it('has no column that could hold transcript text', async () => {
    const { db } = await openIndex(':memory:');
    const columns = tables(db).flatMap((table) => {
      const rows = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
      return rows.map((row) => row.name);
    });
    for (const banned of ['transcript', 'words', 'segment', 'context_text', 'snippet', 'body']) {
      expect(columns).not.toContain(banned);
    }
    db.close();
  });

  it('upsert carries every indexed field', async () => {
    const { db } = await openIndex(':memory:');
    upsertMeeting(db, { ...meta('a'), audioDeletedAt: 'then', status: 'recovered' }, 'folder');
    expect(getMeetingRow(db, 'a')).toMatchObject({
      folder: 'folder',
      status: 'recovered',
      audioDeletedAt: 'then',
    });
  });
});

describe('settings', () => {
  it('round-trips JSON and returns the fallback for missing keys', async () => {
    const { db } = await openIndex(':memory:');
    const settings = new SettingsStore(db);
    settings.set('audio.preset', { name: 'Studio', gain: 0.5 });
    expect(settings.get('audio.preset', null)).toEqual({ name: 'Studio', gain: 0.5 });
    expect(settings.get('missing', 7)).toBe(7);
    settings.delete('audio.preset');
    expect(settings.all()).toEqual({});
  });

  it('defaults auto-delete to Never and treats a damaged value as Never', async () => {
    const { db } = await openIndex(':memory:');
    const settings = new SettingsStore(db);
    expect(settings.getAutoDelete().period).toBe('never');
    settings.set('storage.autoDelete', { period: '7d', scope: 'everything' });
    expect(settings.getAutoDelete().period).toBe('never');
    expect(() => settings.setAutoDelete({ period: 'x', scope: 'audio' } as never)).toThrow();
  });
});

describe('vocabulary', () => {
  it('adds, merges, edits, disables and deletes', async () => {
    const { db } = await openIndex(':memory:');
    const vocabulary = new VocabularyStore(db, now);
    const term = vocabulary.remember({
      term: 'Kubernetes',
      misheard: ['cooper netties'],
      context: { meetingId: 'm1', correctionId: 'c1' },
    });
    const again = vocabulary.remember({ term: 'kubernetes', misheard: ['kuber nettis'] });
    expect(again.id).toBe(term.id);
    expect(again.misheard).toEqual(['cooper netties', 'kuber nettis']);
    expect(again.contexts).toEqual([{ meetingId: 'm1', correctionId: 'c1' }]);

    vocabulary.update(term.id, { enabled: false, misheard: ['coobernetes'] });
    expect(vocabulary.get(term.id)).toMatchObject({ enabled: false, misheard: ['coobernetes'] });
    expect(vocabulary.enabledTerms()).toEqual([]);

    vocabulary.delete(term.id);
    expect(vocabulary.list()).toEqual([]);
    const left = db.prepare('SELECT COUNT(*) n FROM vocabulary_misheard').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('forgetting a correction removes only what that correction added', async () => {
    const { db } = await openIndex(':memory:');
    const vocabulary = new VocabularyStore(db, now);
    const context = (id: string) => ({ meetingId: 'm', correctionId: id });
    vocabulary.remember({ term: 'Acme', misheard: ['acne'], context: context('c1') });
    vocabulary.remember({ term: 'Acme', misheard: ['ack me'], context: context('c2') });
    vocabulary.forgetCorrection('c2', 'ack me');
    expect(vocabulary.list()[0]?.misheard).toEqual(['acne']);
    vocabulary.forgetCorrection('c1', 'acne');
    expect(vocabulary.list()).toEqual([]);
  });
});

describe('voice profiles', () => {
  const vector = (...values: number[]): Float32Array => new Float32Array(values);

  it('stores embeddings exactly, grows, renames, merges and deletes', async () => {
    const { db } = await openIndex(':memory:');
    const profiles = new VoiceProfileStore(db, now);
    const a = profiles.create({ modelId: 'm', embedding: vector(1, 0), meetingId: 'x' });
    expect(Array.from(a.embedding)).toEqual([1, 0]);
    profiles.grow(a.id, vector(0, 1), 1, 'y');
    expect(Array.from(profiles.get(a.id)!.embedding)).toEqual([0.5, 0.5]);
    expect(profiles.get(a.id)!.sampleCount).toBe(2);

    const b = profiles.create({ modelId: 'm', embedding: vector(0.5, 0.5), meetingId: 'z' });
    profiles.rename(a.id, 'Alice');
    profiles.merge(b.id, a.id);
    const merged = profiles.get(a.id)!;
    expect(merged).toMatchObject({ name: 'Alice', sampleCount: 3 });
    expect(merged.meetingIds.sort()).toEqual(['x', 'y', 'z']);
    expect(profiles.get(b.id)).toBeNull();

    profiles.delete(a.id);
    expect(profiles.list()).toEqual([]);
    const links = db.prepare('SELECT COUNT(*) n FROM voice_profile_meetings').get() as { n: number };
    expect(links.n).toBe(0);
  });

  it('refuses to mix speaker models', async () => {
    const { db } = await openIndex(':memory:');
    const profiles = new VoiceProfileStore(db, now);
    const a = profiles.create({ modelId: 'one', embedding: vector(1, 0) });
    const b = profiles.create({ modelId: 'two', embedding: vector(1, 0) });
    expect(() => profiles.merge(a.id, b.id)).toThrow();
    expect(profiles.list('one')).toHaveLength(1);
  });
});
