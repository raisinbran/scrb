import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CorrectionConflictError,
  MeetingNotFoundError,
  StaleRevisionError,
} from '../src/errors.ts';
import type { Correction, Segment, Word } from '../src/formats/transcript.ts';
import { Library } from '../src/library.ts';
import { speaker, tempDir, words } from './helpers.ts';

type Pair = [heard: string, replacement: string, options?: Partial<Correction>];

/** Writes invented corrections straight into a meeting's transcript, with matching words. */
async function fabricate(library: Library, meetingId: string, pairs: Pair[]): Promise<string[]> {
  const current = await library.readTranscript(meetingId);
  const placed: Word[][] = [];
  const made: Correction[] = pairs.map(([heard, replacement, options], index) => {
    const list = words(heard, index * 10_000);
    placed.push(list);
    return {
      id: randomUUID(),
      wordIds: list.map((word) => word.id),
      replacement,
      original: {
        text: heard,
        startMs: list[0]!.startMs,
        endMs: list.at(-1)!.endMs,
        speakerId: 'a',
        track: 'meeting',
      },
      remember: false,
      state: 'active',
      supersededBy: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      ...options,
    };
  });
  const segment: Segment = {
    id: `s-${randomUUID()}`,
    speakerId: 'a',
    track: 'meeting',
    pass: 'final',
    words: placed.flat(),
  };
  await library.saveTranscript(
    meetingId,
    {
      ...current,
      segments: [...current.segments, segment],
      speakers: current.speakers.length > 0 ? current.speakers : [speaker('a')],
      corrections: [...current.corrections, ...made],
    },
    current.revision,
  );
  return made.map((correction) => correction.id);
}

async function meeting(
  library: Library,
  date: string,
  pairs: Pair[] = [],
): Promise<{ id: string; ids: string[] }> {
  const { id } = await library.createMeeting({ title: `Meeting ${date}`, date });
  return { id, ids: pairs.length > 0 ? await fabricate(library, id, pairs) : [] };
}

/** Three meetings give "John Smythe" its 3 corrections, 3 meetings and one repeated form. */
async function seedJohn(library: Library): Promise<string[]> {
  const a = await meeting(library, '2026-11-01', [['jon smith', 'John Smythe']]);
  const b = await meeting(library, '2026-11-02', [['jon smith', 'John Smythe']]);
  const c = await meeting(library, '2026-11-03', [['john smyth', 'John Smythe']]);
  return [a.id, b.id, c.id];
}

describe('vocabulary suggestions: the 3 / 2 / 2 rule', () => {
  it('suggests only terms that meet every part of the rule', async () => {
    const library = await Library.open({ root: await tempDir() });
    const m1 = await meeting(library, '2026-11-01');
    const m2 = await meeting(library, '2026-11-02');
    const m3 = await meeting(library, '2026-11-03');
    await fabricate(library, m1.id, [
      ['alfa', 'Alpha'],
      ['bravo one', 'Bravo'],
      ['charlie a', 'Charlie'],
      ['charlie b', 'Charlie'],
      ['charlie c', 'Charlie'],
      ['d one', 'Delta'],
      ['ee', 'Echo'],
      ['ee', 'Echo'],
      ['fox one', 'Foxtrot'],
    ]);
    await fabricate(library, m2.id, [
      ['alfa', 'Alpha'],
      ['bravo one', 'Bravo'],
      ['d two', 'Delta'],
      ['ex', 'Echo'],
      ['fox one', 'Foxtrot'],
    ]);
    await fabricate(library, m3.id, [
      ['alpha x', 'Alpha'],
      ['d three', 'Delta'],
      ['fox one', 'Foxtrot', { remember: true }],
    ]);

    const result = await library.listVocabularySuggestions();
    expect(result.incomplete).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      term: 'Alpha',
      misheard: ['alfa', 'alpha x'],
      correctionCount: 3,
      meetingCount: 3,
      meetingId: m3.id,
    });
    await library.close();
  });

  it('picks the newest meeting, then the lowest correction ID, as representative', async () => {
    const library = await Library.open({ root: await tempDir() });
    const old = await meeting(library, '2026-11-01', [['jon smith', 'John Smythe']]);
    const newest = await meeting(library, '2026-11-05');
    const ids = await fabricate(library, newest.id, [
      ['jon smith', 'John Smythe'],
      ['jon smith', 'John Smythe'],
    ]);
    const [suggestion] = (await library.listVocabularySuggestions()).suggestions;
    expect(old.ids).toHaveLength(1);
    expect(suggestion?.meetingId).toBe(newest.id);
    expect(suggestion?.correctionId).toBe([...ids].sort()[0]);
    await library.close();
  });

  it('counts unique corrections and normalizes Unicode, case and spacing', async () => {
    const library = await Library.open({ root: await tempDir() });
    await meeting(library, '2026-11-01', [['kafay', 'Café']]);
    await meeting(library, '2026-11-02', [[' KAFAY ', 'café ']]);
    await meeting(library, '2026-11-03', [['ka  fay', '  CAFÉ']]);
    const { suggestions } = await library.listVocabularySuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ correctionCount: 3, meetingCount: 3 });
    expect(suggestions[0]?.misheard).toEqual(['kafay', 'ka fay']);
    await library.close();
  });

  it('ignores no-op, superseded, reverted, over-long and conflicting corrections', async () => {
    const library = await Library.open({ root: await tempDir() });
    const a = await meeting(library, '2026-11-01');
    const b = await meeting(library, '2026-11-02');
    const c = await meeting(library, '2026-11-03');
    const long = 'one two three four five';
    const wide = 'x'.repeat(101);
    for (const m of [a, b, c]) {
      await fabricate(library, m.id, [
        ['jon smith', 'Jon  Smith'],
        ['gam', 'Gamma'],
        ['five words', long],
        ['wide form', wide],
      ]);
    }
    await fabricate(library, a.id, [['gam', 'Gammon']]);
    await fabricate(library, b.id, [
      ['sup', 'Super', { state: 'superseded', supersededBy: 'x' }],
      ['sup', 'Super', { state: 'reverted' }],
      ['sup', 'Super'],
    ]);
    await fabricate(library, c.id, [['sup', 'Super']]);
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);
    await library.close();
  });

  it('skips non-ready meetings and an unreadable one, reports incomplete, deletes nothing', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const [a, b] = await seedJohn(library);
    const busy = await library.createMeeting({
      title: 'Busy',
      date: '2026-11-09',
      status: 'recording',
    });
    await fabricate(library, busy.id, [
      ['jon smith', 'Other'],
      ['jon smith', 'Other'],
      ['jon smith', 'Other'],
    ]);
    expect((await library.listVocabularySuggestions()).suggestions).toHaveLength(1);

    const file = library.meetingPaths(b!).transcript;
    await writeFile(file, '{ not json');
    const result = await library.listVocabularySuggestions();
    expect(result.incomplete).toBe(true);
    expect(result.suggestions).toEqual([]);
    expect(await readFile(file, 'utf8')).toBe('{ not json');
    expect(library.listMeetings().map((row) => row.id)).toContain(a);
    await library.close();
  });
});

describe('vocabulary suggestions: exclusions', () => {
  it('hides remembered terms, disabled ones too, and deleted ones', async () => {
    const library = await Library.open({ root: await tempDir() });
    await seedJohn(library);
    const term = library.vocabulary.remember({ term: 'john smythe' });
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);
    library.vocabulary.update(term.id, { enabled: false });
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);
    library.vocabulary.delete(term.id);
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);
    await library.close();
  });

  it('hides a deleted term whatever its case or spacing', async () => {
    const library = await Library.open({ root: await tempDir() });
    await seedJohn(library);
    const term = library.vocabulary.remember({ term: 'JOHN   Smythe' });
    library.vocabulary.delete(term.id);
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);
    await library.close();
  });

  it('honors a deleted-term marker written by the old hashing', async () => {
    const library = await Library.open({ root: await tempDir() });
    const a = await meeting(library, '2026-11-01', [['jon smith', 'John  Smythe']]);
    await meeting(library, '2026-11-02', [['jon smith', 'John  Smythe']]);
    await meeting(library, '2026-11-03', [['john smyth', 'John  Smythe']]);
    expect((await library.listVocabularySuggestions()).suggestions).toHaveLength(1);
    const legacy = createHash('sha256').update('john  smythe').digest('hex');
    library.settings.set(`vocabulary.deleted.${legacy}`, true);
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);

    library.vocabulary.reconcileRemember({
      term: 'John  Smythe',
      context: { meetingId: a.id, correctionId: a.ids[0]! },
    });
    expect(library.vocabulary.list()).toEqual([]);
    await library.close();
  });

  it('keeps a dismissed term hidden, even after its meeting is deleted, until remembered', async () => {
    const library = await Library.open({ root: await tempDir() });
    const [a] = await seedJohn(library);
    library.dismissVocabularySuggestion('  JOHN   Smythe ');
    expect(library.settings.getDismissedSuggestions()).toEqual(['john smythe']);
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);

    await library.deleteMeeting(a!);
    expect(library.settings.getDismissedSuggestions()).toEqual(['john smythe']);

    library.vocabulary.remember({ term: 'John Smythe' });
    expect(library.settings.getDismissedSuggestions()).toEqual([]);
    await library.close();
  });

  it('keeps at most 500 dismissed terms, dropping the oldest', async () => {
    const library = await Library.open({ root: await tempDir() });
    library.settings.set(
      'vocabulary.dismissedSuggestions',
      Array.from({ length: 499 }, (_, i) => `term ${i}`),
    );
    for (const i of [499, 500, 501]) library.dismissVocabularySuggestion(`Term ${i}`);
    library.dismissVocabularySuggestion('term 501');
    const list = library.settings.getDismissedSuggestions();
    expect(list).toHaveLength(500);
    expect(list[0]).toBe('term 2');
    expect(list.at(-1)).toBe('term 501');
    await library.close();
  });

  it('a deleted source meeting can drop a term below the rule', async () => {
    const library = await Library.open({ root: await tempDir() });
    const [a] = await seedJohn(library);
    await library.deleteMeeting(a!);
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);
    await library.close();
  });
});

describe('vocabulary suggestions: bounds', () => {
  it('reads only the 50 newest ready meetings', async () => {
    const library = await Library.open({ root: await tempDir() });
    const pair: Pair[] = [['jon smith', 'John Smythe']];
    await meeting(library, '2026-01-01', pair);
    await meeting(library, '2026-01-02', pair);
    await meeting(library, '2026-01-03', pair);
    for (let i = 0; i < 49; i += 1)
      await meeting(library, `2026-02-${String(i + 1).padStart(2, '0')}`);
    const within = await library.listVocabularySuggestions();
    expect(within.suggestions).toHaveLength(0);
    expect(within.truncated).toBe(true);
    await library.close();
  });

  it('finds terms in meeting 50 but not 51', async () => {
    const library = await Library.open({ root: await tempDir() });
    const pair: Pair[] = [['jon smith', 'John Smythe']];
    for (let i = 0; i < 47; i += 1)
      await meeting(library, `2026-02-${String(i + 1).padStart(2, '0')}`);
    await meeting(library, '2026-01-03', pair);
    await meeting(library, '2026-01-02', pair);
    await meeting(library, '2026-01-01', pair);
    const result = await library.listVocabularySuggestions();
    expect(result.suggestions).toHaveLength(1);
    expect(result.truncated).toBe(false);
    await library.close();
  });

  it('stops after 5,000 active correction records', async () => {
    const library = await Library.open({ root: await tempDir() });
    const filler = (count: number): Pair[] =>
      Array.from({ length: count }, (_, i): Pair => [`heard ${i}`, `Filler ${i}`]);
    const run = async (
      fillerCount: number,
    ): Promise<Awaited<ReturnType<Library['listVocabularySuggestions']>>> => {
      await meeting(library, '2026-12-01', filler(fillerCount));
      await meeting(library, '2026-11-02', [
        ['jon smith', 'John Smythe'],
        ['jon smith', 'John Smythe'],
      ]);
      await meeting(library, '2026-11-01', [['jon smith', 'John Smythe']]);
      return library.listVocabularySuggestions();
    };
    const result = await run(4_997);
    expect(result.suggestions).toHaveLength(1);
    expect(result.truncated).toBe(false);
    await library.close();

    const other = await Library.open({ root: await tempDir() });
    await meeting(other, '2026-12-01', filler(4_998));
    await meeting(other, '2026-11-02', [
      ['jon smith', 'John Smythe'],
      ['jon smith', 'John Smythe'],
    ]);
    await meeting(other, '2026-11-01', [['jon smith', 'John Smythe']]);
    const cut = await other.listVocabularySuggestions();
    expect(cut.suggestions).toEqual([]);
    expect(cut.truncated).toBe(true);
    await other.close();
  }, 60_000);

  it('returns at most 100 suggestions, most corrected first', async () => {
    const library = await Library.open({ root: await tempDir() });
    const a = await meeting(library, '2026-11-01');
    const b = await meeting(library, '2026-11-02');
    const terms = Array.from({ length: 101 }, (_, i) => `Term ${String(i).padStart(3, '0')}`);
    await fabricate(
      library,
      a.id,
      terms.map((t): Pair => [`${t} heard`, t]),
    );
    await fabricate(
      library,
      b.id,
      terms.flatMap((t): Pair[] => [
        [`${t} heard`, t],
        [`${t} heard`, t],
      ]),
    );
    await fabricate(library, b.id, [
      ['extra', 'Term 100'],
      ['extra', 'Term 100'],
    ]);
    const { suggestions } = await library.listVocabularySuggestions();
    expect(suggestions).toHaveLength(100);
    expect(suggestions[0]?.term).toBe('Term 100');
    expect(suggestions.map((s) => s.term)).not.toContain('Term 099');
    await library.close();
  }, 60_000);
});

describe('vocabulary suggestions: logs', () => {
  it('never put corrected text, misheard forms or terms in a log', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const [, b] = await seedJohn(library);
    library.dismissVocabularySuggestion('John Smythe');
    await writeFile(library.meetingPaths(b!).transcript, '{ not json');
    await library.listVocabularySuggestions();
    await library.close();
    const logs = path.join(root, 'logs');
    const text = (
      await Promise.all(
        (await readdir(logs)).map((name) => readFile(path.join(logs, name), 'utf8')),
      )
    )
      .join('\n')
      .toLowerCase();
    expect(text).toContain('vocabulary-suggestions-skipped');
    for (const secret of ['smythe', 'jon smith', 'john smyth']) expect(text).not.toContain(secret);
  });
});

describe('accepting a vocabulary suggestion', () => {
  async function setup(library: Library): Promise<{ id: string; correctionId: string }> {
    await seedJohn(library);
    const [suggestion] = (await library.listVocabularySuggestions()).suggestions;
    return { id: suggestion!.meetingId, correctionId: suggestion!.correctionId };
  }

  it('remembers the same correction without touching the transcript or summary', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, correctionId } = await setup(library);
    await library.saveGeneratedSummary(id, {
      generatedAt: null,
      brief: null,
      full: null,
      actionItems: [],
      decisions: [],
      openQuestions: [],
      warnings: [],
    });
    const summaryBefore = await library.readSummary(id);
    const before = await library.readTranscript(id);

    const after = await library.acceptVocabularySuggestion(id, correctionId);

    const was = before.corrections.find((c) => c.id === correctionId)!;
    const now = after.corrections.find((c) => c.id === correctionId)!;
    expect(now).toEqual({ ...was, remember: true, updatedAt: now.updatedAt });
    expect(after.corrections).toHaveLength(before.corrections.length);
    expect(after.segments).toEqual(before.segments);
    expect(after.undoStack).toHaveLength(before.undoStack.length + 1);
    expect(library.vocabulary.list()).toMatchObject([
      { term: 'John Smythe', misheard: ['john smyth'] },
    ]);
    expect(summaryBefore?.outdated).toBe(false);
    expect(await library.readSummary(id)).toEqual(summaryBefore);
    expect((await library.listVocabularySuggestions()).suggestions).toEqual([]);
    await library.close();
  });

  it('is a no-op when repeated', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, correctionId } = await setup(library);
    const first = await library.acceptVocabularySuggestion(id, correctionId);
    const second = await library.acceptVocabularySuggestion(id, correctionId);
    expect(second.revision).toBe(first.revision);
    expect(second.undoStack).toHaveLength(first.undoStack.length);
    await library.close();
  });

  it('follows Undo and Redo, which still mark a summary outdated', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, correctionId } = await setup(library);
    await library.acceptVocabularySuggestion(id, correctionId);
    await library.saveGeneratedSummary(id, {
      generatedAt: null,
      brief: null,
      full: null,
      actionItems: [],
      decisions: [],
      openQuestions: [],
      warnings: [],
    });
    const undone = await library.undo(id);
    expect((await library.readSummary(id))?.outdated).toBe(true);
    expect(undone.corrections.find((c) => c.id === correctionId)?.remember).toBe(false);
    expect(library.vocabulary.list()).toEqual([]);
    const redone = await library.redo(id);
    expect(redone.corrections.find((c) => c.id === correctionId)?.remember).toBe(true);
    expect(library.vocabulary.list()).toHaveLength(1);
    await library.close();
  });

  it('fails with a conflict and adds no correction when the word IDs are gone', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, correctionId } = await setup(library);
    const current = await library.readTranscript(id);
    const renewed = current.segments.map((s) => ({
      ...s,
      words: s.words.map((w) => ({ ...w, id: `new-${w.id}` })),
    }));
    await library.saveTranscript(id, { ...current, segments: renewed }, current.revision);
    const stale = await library.readTranscript(id);

    await expect(library.acceptVocabularySuggestion(id, correctionId)).rejects.toBeInstanceOf(
      CorrectionConflictError,
    );
    const after = await library.readTranscript(id);
    expect(after.corrections).toEqual(stale.corrections);
    expect(after.revision).toBe(stale.revision);
    expect(library.vocabulary.list()).toEqual([]);
    await library.close();
  });

  it('refuses a stale revision, a deleted meeting and a changed suggestion', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, correctionId } = await setup(library);
    const current = await library.readTranscript(id);
    await expect(
      library.acceptVocabularySuggestion(id, correctionId, current.revision - 1),
    ).rejects.toBeInstanceOf(StaleRevisionError);

    library.dismissVocabularySuggestion('John Smythe');
    await expect(library.acceptVocabularySuggestion(id, correctionId)).rejects.toBeInstanceOf(
      CorrectionConflictError,
    );
    expect(library.vocabulary.list()).toEqual([]);

    await library.deleteMeeting(id);
    await expect(library.acceptVocabularySuggestion(id, correctionId)).rejects.toBeInstanceOf(
      MeetingNotFoundError,
    );
    await library.close();
  });

  it('repairs vocabulary on restart when the sync fails after the save', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id, correctionId } = await setup(library);
    vi.spyOn(library.vocabulary, 'remember').mockImplementation(() => {
      throw new Error('disk full');
    });
    const saved = await library.acceptVocabularySuggestion(id, correctionId);
    expect(saved.corrections.find((c) => c.id === correctionId)?.remember).toBe(true);
    expect(library.vocabulary.list()).toEqual([]);
    await library.close();

    library = await Library.open({ root });
    expect(library.vocabulary.list()).toMatchObject([{ term: 'John Smythe' }]);
    await library.close();
  });

  it('writes no correction text to the logs', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const { id, correctionId } = await setup(library);
    vi.spyOn(library.vocabulary, 'remember').mockImplementation(() => {
      throw new Error('smythe jon smith');
    });
    await library.acceptVocabularySuggestion(id, correctionId);
    await library.close();
    const logs = path.join(root, 'logs');
    const text = (
      await Promise.all(
        (await readdir(logs)).map((name) => readFile(path.join(logs, name), 'utf8')),
      )
    )
      .join('\n')
      .toLowerCase();
    expect(text).toContain('vocabulary-learning-pending');
    for (const secret of ['smythe', 'jon smith']) expect(text).not.toContain(secret);
  });
});
