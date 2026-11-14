import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { resolveDisplay } from '../src/corrections.ts';
import type { Segment, TranscriptFile } from '../src/formats/transcript.ts';
import { Library } from '../src/library.ts';
import { segment, speaker, tempDir, words } from './helpers.ts';

// Gate 5 evidence: every kind of user correction survives a real restart (a new Library on the
// same folder) and a final pass, byte for byte. Invented text only.

const A_TEXT = 'we should ask jon smith about the budget before friday';
const B_TEXT = 'the pen is on the table and the pens are in the drawer';

interface Fixture {
  root: string;
  library: Library;
  id: string;
  a: string[];
  b: string[];
}

async function fixture(): Promise<Fixture> {
  const root = await tempDir();
  const library = await Library.open({ root });
  const { id } = await library.createMeeting({ title: 'Invented sync', date: '2026-11-14' });
  const a = words(A_TEXT, 0);
  const b = words(B_TEXT, 10_000);
  await library.appendSegments(
    id,
    [segment('s1', 'a', a), segment('s2', 'b', b)],
    [speaker('a', 'Speaker 1'), speaker('b', 'Speaker 2')],
  );
  await library.updateMeeting(id, { status: 'ready' });
  return { root, library, id, a: a.map((w) => w.id), b: b.map((w) => w.id) };
}

const shown = (t: TranscriptFile): string =>
  resolveDisplay(t)
    .map((s) => `${s.speakerId}:${s.tokens.map((token) => token.text).join(' ')}`)
    .join(' | ');

/** Same words and timings as the live text, as the final pass would return them. */
function finalSegments(): {
  segments: Segment[];
  speakers: ReturnType<typeof speaker>[];
} {
  return {
    segments: [
      segment('fa', 'a', words(A_TEXT.replace('jon smith', 'john smit'), 0, 'fa'), 'final'),
      segment('fb', 'b', words(B_TEXT, 10_000, 'fb'), 'final'),
    ],
    speakers: [speaker('a', 'Speaker 1'), speaker('b', 'Speaker 2')],
  };
}

/** Everything the user did, with no model text in it. */
const userState = (t: TranscriptFile, only?: TranscriptFile): unknown => ({
  corrections: t.corrections,
  overrides: t.speakerOverrides,
  speakers: t.speakers
    .filter((s) => only === undefined || only.speakers.some((o) => o.id === s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      userNamed: s.userNamed,
      mergedInto: s.mergedInto,
    })),
});

type Edit = (f: Fixture) => Promise<TranscriptFile>;

const edits: Record<string, Edit> = {
  'word edit (typo)': (f) =>
    f.library.applyCorrection(f.id, { wordIds: f.a.slice(3, 5), replacement: 'John Smythe' }),
  'word edit remembered': (f) =>
    f.library.applyCorrection(f.id, {
      wordIds: f.a.slice(3, 5),
      replacement: 'John Smythe',
      remember: true,
    }),
  'word edit revised twice': async (f) => {
    await f.library.applyCorrection(f.id, { wordIds: f.a.slice(3, 5), replacement: 'John Smyth' });
    return f.library.applyCorrection(f.id, { wordIds: f.a.slice(3, 5), replacement: 'Jon Smythe' });
  },
  'wider edit absorbs a narrower one': async (f) => {
    await f.library.applyCorrection(f.id, { wordIds: f.a.slice(3, 4), replacement: 'John' });
    return f.library.applyCorrection(f.id, {
      wordIds: f.a.slice(2, 5),
      replacement: 'ask John S.',
    });
  },
  'revert correction': async (f) => {
    const t = await f.library.applyCorrection(f.id, {
      wordIds: f.a.slice(0, 1),
      replacement: 'We',
    });
    return f.library.revertCorrection(f.id, t.corrections[0]!.id);
  },
  'speaker rename': (f) => f.library.renameSpeaker(f.id, 'a', 'Dana'),
  'speaker merge': (f) => f.library.mergeSpeakers(f.id, 'b', 'a'),
  'speaker split': async (f) => {
    const t = await f.library.readTranscript(f.id);
    return f.library.splitSpeaker(f.id, f.a.slice(3, 5), 'Guest', t.revision);
  },
  'speaker reassign': (f) => f.library.reassignSpeaker(f.id, f.a.slice(3, 5), 'b'),
  'rename then merge then reassign': async (f) => {
    await f.library.renameSpeaker(f.id, 'b', 'Lee');
    await f.library.reassignSpeaker(f.id, f.a.slice(0, 2), 'b');
    return f.library.mergeSpeakers(f.id, 'b', 'a');
  },
  'edit plus speaker change': async (f) => {
    await f.library.applyCorrection(f.id, { wordIds: f.b.slice(1, 2), replacement: 'Penn' });
    return f.library.renameSpeaker(f.id, 'b', 'Lee');
  },
};

const stages = ['applied', 'undone', 'redone'] as const;

describe('Gate 5: user corrections survive restart and final pass', () => {
  for (const [name, edit] of Object.entries(edits)) {
    for (const stage of stages) {
      it(`${name}, ${stage}: identical bytes after restart, user state kept after final pass`, async () => {
        const f = await fixture();
        let { library } = f;
        let current = await edit(f);
        if (stage !== 'applied') current = await library.undo(f.id);
        if (stage === 'redone') current = await library.redo(f.id);
        const file = library.meetingPaths(f.id).transcript;
        const before = await readFile(file);
        await library.close();

        // Restart 1: a new library on the same folder reads exactly what was saved.
        library = await Library.open({ root: f.root });
        expect(await readFile(file)).toEqual(before);
        const reopened = await library.readTranscript(f.id);
        expect(reopened).toEqual(current);

        // Final pass on the same meeting.
        const passed = await library.applyFinalPass(f.id, finalSegments());
        expect(userState(passed, current)).toEqual(userState(current));
        if (stage !== 'undone') {
          // Edited text is still what the user typed, on the final-pass words.
          for (const c of current.corrections.filter((x) => x.state === 'active')) {
            expect(shown(passed)).toContain(c.replacement);
          }
        }
        await library.close();

        // Restart 2: the post-final-pass file reads back unchanged and undo history still works.
        library = await Library.open({ root: f.root });
        const again = await library.readTranscript(f.id);
        expect(again).toEqual(passed);
        expect(userState(again, current)).toEqual(userState(current));
        await library.close();
      });
    }
  }

  it('undo and redo still work after restart plus final pass', async () => {
    const f = await fixture();
    await f.library.applyCorrection(f.id, { wordIds: f.a.slice(3, 5), replacement: 'John Smythe' });
    await f.library.renameSpeaker(f.id, 'a', 'Dana');
    await f.library.close();
    const library = await Library.open({ root: f.root });
    await library.applyFinalPass(f.id, finalSegments());
    const undone = await library.undo(f.id);
    expect(undone.speakers.find((s) => s.id === 'a')?.name).toBeNull();
    expect(shown(undone)).toContain('John Smythe');
    const undone2 = await library.undo(f.id);
    expect(shown(undone2)).not.toContain('John Smythe');
    await library.redo(f.id);
    const redone = await library.redo(f.id);
    expect(shown(redone)).toContain('John Smythe');
    expect(redone.speakers.find((s) => s.id === 'a')?.name).toBe('Dana');
    await library.close();
  });
});

describe('Gate 5: learned terms never replace a similar but different word', () => {
  it('a remembered correction changes only the selected words, not similar words elsewhere', async () => {
    const f = await fixture();
    // "pen" -> "Penn" on one word; "pens", other "pen"s, and "the" must stay.
    await f.library.applyCorrection(f.id, {
      wordIds: f.b.slice(1, 2),
      replacement: 'Penn',
      remember: true,
    });
    const t = await f.library.readTranscript(f.id);
    expect(shown(t)).toContain('the Penn is on the table and the pens are in the drawer');
    await f.library.close();

    const library = await Library.open({ root: f.root });
    const terms = library.vocabulary.enabledTerms();
    expect(terms.map((t) => t.term)).toEqual(['Penn']);
    expect(terms[0]?.misheard).toEqual(['pen']);
    // The final pass returns the same similar words; the learned term must not touch them.
    const passed = await library.applyFinalPass(f.id, {
      segments: [
        segment('fa', 'a', words(A_TEXT, 0, 'fa'), 'final'),
        segment(
          'fb',
          'b',
          words('the pen is on the table and the pens are in the drawer pen pend', 10_000, 'fb'),
          'final',
        ),
      ],
      speakers: [speaker('a'), speaker('b')],
    });
    const text = shown(passed);
    expect(text).toContain('pens are in the drawer pen pend');
    expect(passed.corrections.filter((c) => c.state === 'active')).toHaveLength(1);
    await library.close();
  });
});
