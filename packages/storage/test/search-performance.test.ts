import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { Library } from '../src/library.ts';
import { emptyTranscript } from '../src/formats/transcript.ts';

describe('large-library search budget', () => {
  it('filters 5,000 indexed meetings before transcript reads, under 2 seconds', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE meetings (
        id TEXT PRIMARY KEY, folder TEXT, title TEXT, date TEXT, created_at TEXT,
        duration_ms INTEGER, source TEXT, status TEXT, audio_deleted_at TEXT
      )`);
      const insert = db.prepare('INSERT INTO meetings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      db.exec('BEGIN');
      for (let i = 0; i < 5_000; i += 1) {
        const selected = i % 25 === 0;
        const id = `meeting-${String(i).padStart(4, '0')}`;
        insert.run(
          id,
          id,
          i % 100 === 0 ? `Needle ${i}` : `Other meeting ${i}`,
          selected ? '2026-10-31T12:00:00.000Z' : '2026-10-01T12:00:00.000Z',
          '2026-10-31T00:00:00.000Z',
          60_000,
          i % 2 === 0 ? 'recorded' : 'imported',
          'ready',
          null,
        );
      }
      db.exec('COMMIT');

      const readTranscript = vi.fn(async (id: string) => emptyTranscript(id));
      // Exercise the real SQL row filter and Library.search algorithm without disk/model I/O.
      const library = {
        db,
        readTranscript,
        logger: { log: vi.fn() },
      } as unknown as Library;
      const started = performance.now();
      const outcome = await Library.prototype.search.call(library, 'Needle', {
        fromDate: '2026-10-31',
        toDate: '2026-10-31',
        origin: 'recorded',
        includeRow: (row) => Number(row.id.slice(-4)) % 100 === 0,
      });
      const elapsedMs = performance.now() - started;

      expect(outcome.skippedMeetingIds).toEqual([]);
      expect(outcome.results).toHaveLength(50);
      expect(readTranscript).toHaveBeenCalledTimes(50);
      expect(outcome.results.every((result) => result.matchedIn.includes('title or date'))).toBe(
        true,
      );
      expect(elapsedMs).toBeLessThan(2_000);
    } finally {
      db.close();
    }
  }, 20_000);
});
