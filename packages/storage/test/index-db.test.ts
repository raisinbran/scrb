import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
        expect(getMeetingRow(db, 'm1')).toMatchObject({
          title: 'Kept title',
          audioDeletedAt: null,
        });
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

  it('refuses an upgrade before creating a snapshot if storage space is insufficient', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 2);
    old.close();
    const bytes = await readFile(file);
    await expect(openIndex(file, { availableBytes: 0n })).rejects.toMatchObject({
      code: 'INDEX_SPACE',
    });
    expect(await readFile(file)).toEqual(bytes);
    expect((await readdir(path.dirname(file))).some((name) => name.includes('.upgrade-'))).toBe(
      false,
    );
  });

  it('rejects an invalid snapshot version without migrating the original index', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 2);
    old.close();
    const bytes = await readFile(file);

    await expect(
      openIndex(file, {
        afterSnapshot(snapshot) {
          const copy = new DatabaseSync(snapshot);
          copy.exec('PRAGMA user_version = 1');
          copy.close();
        },
      }),
    ).rejects.toMatchObject({ code: 'INDEX_SNAPSHOT' });
    expect(await readFile(file)).toEqual(bytes);

    // Nothing was migrated, so a bad copy must not lock the library on the next launch.
    expect(await readdir(path.dirname(file))).toEqual(['index.sqlite']);
    const { db } = await openIndex(file);
    expect(readIndexVersion(db)).toBe(INDEX_VERSION);
    db.close();
  });

  it('refuses a consistent but semantically altered backup before touching the source', async () => {
    const root = await tempDir();
    const file = path.join(root, 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 2);
    old.prepare(`INSERT INTO settings VALUES ('theme', '"dark"')`).run();
    old.close();
    const original = await readFile(file);
    await expect(
      openIndex(file, {
        afterSnapshot(copy) {
          const altered = new DatabaseSync(copy);
          altered.prepare(`UPDATE settings SET value = '"light"' WHERE key = 'theme'`).run();
          altered.close();
        },
      }),
    ).rejects.toMatchObject({ code: 'INDEX_SNAPSHOT' });
    expect(await readFile(file)).toEqual(original);
    expect(await readdir(root)).toEqual(['index.sqlite']);
  });

  it('preserves an unowned partial index rather than guessing it is disposable', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 2);
    old.close();
    await writeFile(`${file}.copying-synthetic`, 'partial');
    await expect(openIndex(file)).rejects.toMatchObject({ code: 'INDEX_RECOVERY_REQUIRED' });
    expect(await readFile(`${file}.copying-synthetic`, 'utf8')).toBe('partial');
    const oldIndex = new DatabaseSync(file, { readOnly: true });
    expect(readIndexVersion(oldIndex)).toBe(2);
    oldIndex.close();
  });

  it('refuses an upgrade that changed pre-existing rows and keeps the recovery copy', async () => {
    const root = await tempDir();
    const file = path.join(root, 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 2);
    old.prepare(`INSERT INTO settings VALUES ('theme', '"dark"')`).run();
    old.close();

    await expect(
      openIndex(file, {
        afterMigration(db) {
          db.prepare(`UPDATE settings SET value = '"light"' WHERE key = 'theme'`).run();
        },
      }),
    ).rejects.toMatchObject({ code: 'INDEX_MIGRATION' });
    expect((await readdir(root)).some((name) => name.startsWith('index.sqlite.upgrade-'))).toBe(
      true,
    );
    await expect(openIndex(file)).rejects.toMatchObject({ code: 'INDEX_RECOVERY_REQUIRED' });
  });

  it.each(['beforeMigration', 'afterMigration'] as const)(
    'recovers after a real child process is killed at %s',
    async (phase) => {
      const file = path.join(await tempDir(), 'index.sqlite');
      const old = new DatabaseSync(file);
      migrate(old, MIGRATIONS, 5);
      old.prepare('INSERT INTO settings VALUES (?, ?)').run('theme', '"dark"');
      old.close();

      const script = `
        import { openIndex } from ${JSON.stringify(new URL('../src/db/database.ts', import.meta.url).href)};
        await openIndex(process.argv[1], {
          ${phase}(db) {
            if (db) {
              db.exec('BEGIN IMMEDIATE');
              db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('"light"', 'theme');
            }
            process.kill(process.pid, 'SIGKILL');
          }
        });
      `;
      const killed = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--input-type=module', '-e', script, file],
        { encoding: 'utf8' },
      );
      expect(killed.status).not.toBe(0);
      expect(
        (await readdir(path.dirname(file))).some((name) =>
          name.startsWith('index.sqlite.upgrade-'),
        ),
      ).toBe(true);

      const recovered = await openIndex(file);
      expect(readIndexVersion(recovered.db)).toBe(INDEX_VERSION);
      expect(new SettingsStore(recovered.db).get('theme', 'light')).toBe('dark');
      recovered.db.close();
      expect(
        (await readdir(path.dirname(file))).some((name) =>
          name.startsWith('index.sqlite.upgrade-'),
        ),
      ).toBe(false);
    },
  );

  it('recovers when a real child is killed inside a schema migration transaction', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 5);
    old.prepare('INSERT INTO settings VALUES (?, ?)').run('theme', '"dark"');
    old.close();
    const reached = `${file}.migration-reached`;

    const script = `
      import { DatabaseSync } from 'node:sqlite';
      import { writeFileSync } from 'node:fs';
      import { openIndex } from ${JSON.stringify(new URL('../src/db/database.ts', import.meta.url).href)};
      const original = DatabaseSync.prototype.exec;
      DatabaseSync.prototype.exec = function (sql) {
        const result = original.call(this, sql);
        if (sql.includes('CREATE TABLE vocabulary_misheard_sources')) {
          writeFileSync(process.argv[2], 'inside-transaction');
          process.kill(process.pid, 'SIGKILL');
        }
        return result;
      };
      await openIndex(process.argv[1]);
    `;
    const killed = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script, file, reached],
      { encoding: 'utf8' },
    );
    expect(killed.status).not.toBe(0);
    expect(await readFile(reached, 'utf8')).toBe('inside-transaction');

    const { db } = await openIndex(file);
    expect(readIndexVersion(db)).toBe(INDEX_VERSION);
    expect(new SettingsStore(db).get('theme', 'light')).toBe('dark');
    db.close();
  });

  it('refuses an unresolved upgrade snapshot, preserving both versions on retry', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const older = new DatabaseSync(file);
    migrate(older, MIGRATIONS, 3);
    older.prepare("INSERT INTO settings VALUES ('theme', '\"dark\"')").run();
    older.close();
    const before = await readFile(file);
    const snapshot = `${file}.upgrade-synthetic`;
    await writeFile(snapshot, before);

    await expect(openIndex(file)).rejects.toMatchObject({
      code: 'INDEX_RECOVERY_REQUIRED',
    });
    expect(await readFile(file)).toEqual(before);
    expect(await readFile(snapshot)).toEqual(before);

    // Even a completed migration is not proof that the leftover snapshot is safe to erase.
    const completed = new DatabaseSync(file);
    migrate(completed);
    completed.close();
    await expect(openIndex(file)).rejects.toMatchObject({
      code: 'INDEX_RECOVERY_REQUIRED',
    });
    expect(await readFile(snapshot)).toEqual(before);
  });

  it('removes an abandoned journal temporary file without blocking an index upgrade', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 5);
    old.close();
    await writeFile(`${file}.upgrade-state.json.tmp`, '{interrupted');

    const { db } = await openIndex(file);
    expect(readIndexVersion(db)).toBe(INDEX_VERSION);
    db.close();
    expect(await readdir(path.dirname(file))).toEqual(['index.sqlite']);
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

  it('keeps a verified newer index usable when cleanup is blocked, then cleans on restart', async () => {
    const root = await tempDir();
    const file = path.join(root, 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 2);
    old.prepare(`INSERT INTO settings VALUES ('theme', '"dark"')`).run();
    old.close();
    const first = await openIndex(file, {
      beforeSnapshotRemoval() {
        throw Object.assign(new Error('invented AV lock'), { code: 'EBUSY' });
      },
    });
    expect(first.retainedSnapshot).toBe(true);
    expect(readIndexVersion(first.db)).toBe(INDEX_VERSION);
    expect(new SettingsStore(first.db).get('theme', 'light')).toBe('dark');
    first.db.close();
    expect((await readdir(root)).some((name) => name.startsWith('index.sqlite.upgrade-'))).toBe(
      true,
    );

    const second = await openIndex(file);
    expect(second.retainedSnapshot).toBe(false);
    expect(new SettingsStore(second.db).get('theme', 'light')).toBe('dark');
    second.db.close();
    expect((await readdir(root)).filter((name) => name.includes('.upgrade-'))).toEqual([]);
  });

  it('rolls back a killed writer before verifying a retained migrated index', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 5);
    old.prepare('INSERT INTO settings VALUES (?, ?)').run('theme', '"dark"');
    old.close();
    const first = await openIndex(file, {
      beforeSnapshotRemoval() {
        throw new Error('synthetic retained copy');
      },
    });
    expect(first.retainedSnapshot).toBe(true);
    first.db.close();

    const script = `
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(process.argv[1]);
      db.exec('BEGIN IMMEDIATE');
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('"light"', 'theme');
      process.kill(process.pid, 'SIGKILL');
    `;
    const killed = spawnSync(process.execPath, ['--input-type=module', '-e', script, file], {
      encoding: 'utf8',
    });
    expect(killed.status).not.toBe(0);

    const restarted = await openIndex(file);
    expect(new SettingsStore(restarted.db).get('theme', 'light')).toBe('dark');
    expect(restarted.retainedSnapshot).toBe(false);
    restarted.db.close();
  });

  it('does not overwrite the retained case C journal when another migration is due', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const old = new DatabaseSync(file);
    migrate(old, MIGRATIONS, 4);
    old.close();
    const snapshot = `${file}.upgrade-11111111-1111-4111-8111-111111111111`;
    const original = new DatabaseSync(file);
    original.prepare('VACUUM INTO ?').run(snapshot);
    original.close();
    const digest = createHash('sha256')
      .update(await readFile(snapshot))
      .digest('hex');
    const journalPath = `${file}.upgrade-state.json`;
    const journal = JSON.stringify({
      attemptId: '11111111-1111-4111-8111-111111111111',
      oldVersion: 4,
      targetVersion: 5,
      phase: 'migrationVerified',
      snapshotHash: digest,
    });
    await writeFile(journalPath, journal);
    const upgraded = new DatabaseSync(file);
    migrate(upgraded, MIGRATIONS, 5);
    upgraded.close();

    const result = await openIndex(file, {
      beforeSnapshotRemoval() {
        throw new Error('synthetic retained snapshot lock');
      },
    });
    expect(result.retainedSnapshot).toBe(true);
    expect(readIndexVersion(result.db)).toBe(5);
    result.db.close();
    expect(await readFile(journalPath, 'utf8')).toBe(journal);
    expect(await readdir(path.dirname(file))).toContain(path.basename(snapshot));
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

  it('undoes and redoes user vocabulary edits and deletes without retaining deleted terms in a backup', async () => {
    const { db } = await openIndex(':memory:');
    const vocabulary = new VocabularyStore(db, now);
    const a = vocabulary.remember({ term: 'Synthetic', misheard: ['syn thetic'] });
    expect(vocabulary.undoState().canUndo).toBe(false);
    vocabulary.update(a.id, { term: 'Edited synthetic', enabled: false });
    expect(vocabulary.undo().canRedo).toBe(true);
    expect(vocabulary.get(a.id)).toMatchObject({ term: 'Synthetic', enabled: true });
    vocabulary.redo();
    expect(vocabulary.get(a.id)).toMatchObject({ term: 'Edited synthetic', enabled: false });
    vocabulary.delete(a.id);
    expect(vocabulary.get(a.id)).toBeNull();
    vocabulary.undo();
    expect(vocabulary.get(a.id)?.id).toBe(a.id);
    vocabulary.redo();
    expect(vocabulary.get(a.id)).toBeNull();
    db.close();
  });

  it('refuses a vocabulary undo that clashes with a newer term, then reaches older edits', async () => {
    const { db } = await openIndex(':memory:');
    const vocabulary = new VocabularyStore(db, now);
    const older = vocabulary.remember({ term: 'Older' });
    const term = vocabulary.remember({ term: 'Invented' });
    vocabulary.update(older.id, { enabled: false });
    vocabulary.delete(term.id);
    vocabulary.remember({ term: 'Invented', context: { meetingId: 'm', correctionId: 'c' } });
    expect(() => vocabulary.undo()).toThrow(
      expect.objectContaining({ code: 'VOCABULARY_CHANGED' }),
    );
    expect(vocabulary.list().map((item) => item.term)).toEqual(['Invented', 'Older']);
    vocabulary.undo();
    expect(vocabulary.get(older.id)?.enabled).toBe(true);
    db.close();
  });

  it('keeps source provenance after undoing a manual vocabulary term edit', async () => {
    const { db } = await openIndex(':memory:');
    const vocabulary = new VocabularyStore(db, now);
    const term = vocabulary.remember({
      term: 'Synthetic source',
      misheard: ['sin thetic'],
      context: { meetingId: 'synthetic', correctionId: 'first' },
    });
    vocabulary.update(term.id, { enabled: false });
    vocabulary.undo();
    expect(vocabulary.get(term.id)?.enabled).toBe(true);
    vocabulary.remember({
      term: 'Synthetic source',
      misheard: ['sin thetic'],
      context: { meetingId: 'synthetic', correctionId: 'second' },
    });
    vocabulary.forgetCorrection('first', 'sin thetic');
    expect(vocabulary.get(term.id)?.misheard).toEqual(['sin thetic']);
    vocabulary.forgetCorrection('second', 'sin thetic');
    expect(vocabulary.get(term.id)).toBeNull();
    db.close();
  });

  it('retains a misheard form backed by another correction, then removes the final unedited source', async () => {
    const { db } = await openIndex(':memory:');
    const vocabulary = new VocabularyStore(db, now);
    const context = (correctionId: string) => ({ meetingId: 'synthetic', correctionId });
    const term = vocabulary.remember({
      term: 'Invented',
      misheard: ['in vented'],
      context: context('c1'),
    });
    vocabulary.remember({ term: 'Invented', misheard: ['in vented'], context: context('c2') });
    vocabulary.forgetCorrection('c1', 'in vented');
    expect(vocabulary.get(term.id)?.misheard).toEqual(['in vented']);
    vocabulary.forgetCorrection('c2', 'in vented');
    expect(vocabulary.get(term.id)).toBeNull();
    db.close();
  });

  it('keeps an explicitly entered form after its correction source is removed', async () => {
    const { db } = await openIndex(':memory:');
    const vocabulary = new VocabularyStore(db, now);
    const term = vocabulary.remember({ term: 'Invented', misheard: ['in vented'] });
    vocabulary.remember({
      term: 'Invented',
      misheard: ['in vented'],
      context: { meetingId: 'synthetic', correctionId: 'c1' },
    });
    vocabulary.forgetCorrection('c1', 'in vented');
    expect(vocabulary.get(term.id)?.misheard).toEqual(['in vented']);
    db.close();
  });

  it('never removes an untracked pre-v6 form after a later correction is undone', async () => {
    const file = path.join(await tempDir(), 'index.sqlite');
    const legacy = new DatabaseSync(file);
    migrate(legacy, MIGRATIONS, 5);
    legacy
      .prepare("INSERT INTO vocabulary_terms VALUES ('legacy-id', 'Synthetic', 0, ?, ?)")
      .run(now(), now());
    legacy.prepare("INSERT INTO vocabulary_misheard VALUES ('legacy-id', 'sin thetic')").run();
    legacy.close();
    const { db } = await openIndex(file);
    const vocabulary = new VocabularyStore(db, now);
    vocabulary.remember({
      term: 'Synthetic',
      misheard: ['sin thetic'],
      context: { meetingId: 'synthetic', correctionId: 'c2' },
    });
    vocabulary.forgetCorrection('c2', 'sin thetic');
    expect(vocabulary.get('legacy-id')?.misheard).toEqual(['sin thetic']);
    db.close();
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
    const links = db.prepare('SELECT COUNT(*) n FROM voice_profile_meetings').get() as {
      n: number;
    };
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
