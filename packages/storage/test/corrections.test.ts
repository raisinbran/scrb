import { describe, expect, it } from 'vitest';
import {
  activeSpeakers,
  appendSegments,
  applyCorrection,
  applyFinalPass,
  frozenWordIds,
  mergeSpeakers,
  reassignSpeaker,
  redo,
  renameSpeaker,
  replaceLiveSegments,
  resolveDisplay,
  revertCorrection,
  undo,
  verifyCorrectionsIntact,
} from '../src/corrections.ts';
import { CorrectionConflictError } from '../src/errors.ts';
import type { TranscriptFile, Word } from '../src/formats/transcript.ts';
import { segment, speaker, transcript, words } from './helpers.ts';

const shown = (t: TranscriptFile): string =>
  resolveDisplay(t)
    .flatMap((s) => s.tokens.map((token) => token.text))
    .join(' ');

function live(): { t: TranscriptFile; w: Word[] } {
  const w = words('we should ask jon smith about the budget before friday', 0);
  return { t: transcript([segment('s1', 'a', w)], [speaker('a')]), w };
}

const ids = (w: Word[], from: number, to: number): string[] => w.slice(from, to).map((x) => x.id);

/** Asserts the correction is shown and its words are consecutive, unchanged and in order. */
function expectSurvives(before: TranscriptFile, after: TranscriptFile): void {
  verifyCorrectionsIntact(before, after);
  const display = resolveDisplay(after).flatMap((s) => s.tokens);
  for (const correction of after.corrections.filter((c) => c.state === 'active')) {
    expect(display.some((token) => token.correctionId === correction.id)).toBe(true);
    const order = after.segments.flatMap((s) => s.words.map((w) => w.id));
    const start = order.indexOf(correction.wordIds[0] as string);
    expect(order.slice(start, start + correction.wordIds.length)).toEqual(correction.wordIds);
  }
}

describe('correction layer', () => {
  it('keeps the original beside the correction and the display prefers the correction', () => {
    const { t, w } = live();
    const { transcript: next, correction } = applyCorrection(t, {
      wordIds: ids(w, 3, 5),
      replacement: 'John Smythe',
    });
    expect(shown(next)).toBe('we should ask John Smythe about the budget before friday');
    expect(correction.original).toMatchObject({
      text: 'jon smith',
      startMs: 1500,
      endMs: 2400,
      speakerId: 'a',
      track: 'meeting',
    });
    expect(next.segments[0]?.words.map((x) => x.text)).toEqual(w.map((x) => x.text));
  });

  it('refuses a gap in the selection, a missing word and a mixed-track selection', () => {
    const { t, w } = live();
    const gap = { wordIds: [w[0]!.id, w[2]!.id], replacement: 'x' };
    expect(() => applyCorrection(t, gap)).toThrow(CorrectionConflictError);
    expect(() => applyCorrection(t, { wordIds: ['nope'], replacement: 'x' })).toThrow();
    expect(() => applyCorrection(t, { wordIds: [], replacement: 'x' })).toThrow();
    const mic = segment('mic', 'you', words('hello there', 500), 'live', 'microphone');
    const mixed = appendSegments(t, [mic], [speaker('you')]);
    const across = { wordIds: [w[0]!.id, mic.words[0]!.id], replacement: 'x' };
    expect(() => applyCorrection(mixed, across)).toThrow(CorrectionConflictError);
  });

  it('re-editing the exact span updates the same correction and keeps the original', () => {
    const { t, w } = live();
    const first = applyCorrection(t, { wordIds: ids(w, 3, 5), replacement: 'John Smith' });
    const second = applyCorrection(first.transcript, {
      wordIds: ids(w, 3, 5),
      replacement: 'John Smythe',
    });
    expect(second.correction.id).toBe(first.correction.id);
    expect(second.correction.original.text).toBe('jon smith');
    expect(second.transcript.corrections).toHaveLength(1);
  });

  it('a wider selection absorbs inner corrections; undo restores them', () => {
    const { t, w } = live();
    const inner = applyCorrection(t, { wordIds: ids(w, 3, 5), replacement: 'John' });
    const wide = applyCorrection(inner.transcript, {
      wordIds: ids(w, 2, 6),
      replacement: 'ask John about',
    });
    expect(shown(wide.transcript)).toBe('we should ask John about the budget before friday');
    expect(wide.transcript.corrections.find((c) => c.id === inner.correction.id)?.state).toBe(
      'superseded',
    );
    expect(shown(undo(wide.transcript))).toBe('we should ask John about the budget before friday');
    expect(undo(wide.transcript).corrections.map((c) => c.state)).toEqual(['active']);
  });

  it('refuses a selection that cuts through a correction and changes nothing', () => {
    const { t, w } = live();
    const first = applyCorrection(t, { wordIds: ids(w, 3, 5), replacement: 'John' });
    expect(() =>
      applyCorrection(first.transcript, { wordIds: ids(w, 4, 6), replacement: 'x' }),
    ).toThrow(CorrectionConflictError);
  });

  it('undo and redo cover corrections and speaker edits, and a new edit clears redo', () => {
    const { t, w } = live();
    const corrected = applyCorrection(t, { wordIds: ids(w, 7, 8), replacement: 'BUDGET' });
    const renamed = renameSpeaker(corrected.transcript, 'a', 'Alice');
    const undone = undo(undo(renamed));
    expect(shown(undone)).toBe(shown(t));
    expect(undone.speakers[0]?.name).toBeNull();
    const redone = redo(redo(undone));
    expect(shown(redone)).toContain('BUDGET');
    expect(redone.speakers[0]?.name).toBe('Alice');
    const fresh = renameSpeaker(undo(redone), 'a', 'Bob');
    expect(fresh.redoStack).toHaveLength(0);
    expect(undo(transcript([], []))).toEqual(transcript([], []));
  });

  it('revert frees the words and reinstates absorbed corrections', () => {
    const { t, w } = live();
    const inner = applyCorrection(t, { wordIds: ids(w, 3, 5), replacement: 'John' });
    const wide = applyCorrection(inner.transcript, { wordIds: ids(w, 2, 6), replacement: 'WIDE' });
    const reverted = revertCorrection(wide.transcript, wide.correction.id);
    expect(reverted.corrections.find((c) => c.id === inner.correction.id)?.state).toBe('active');
    expect(frozenWordIds(reverted)).toEqual(new Set(ids(w, 3, 5)));
    const allBack = revertCorrection(reverted, inner.correction.id);
    expect(frozenWordIds(allBack).size).toBe(0);
    expect(shown(allBack)).toBe(shown(t));
  });
});

describe('freeze rules through the final pass', () => {
  function finalPass(text: string, offsetMs = 0): { segments: ReturnType<typeof segment>[] } {
    return { segments: [segment('f1', 'F', words(text, offsetMs, 'f'), 'final')] };
  }
  const finalSpeakers = [speaker('F', 'Speaker 1')];

  it('keeps corrected text when the final pass hears it differently', () => {
    const { t, w } = live();
    const { transcript: c } = applyCorrection(t, {
      wordIds: ids(w, 3, 5),
      replacement: 'J. Smythe',
    });
    const next = applyFinalPass(c, {
      ...finalPass('we should ask john smit about the budget before friday.'),
      speakers: finalSpeakers,
    });
    expect(shown(next)).toBe('we should ask J. Smythe about the budget before friday.');
    expectSurvives(c, next);
    expect(next.segments.flatMap((s) => s.words).map((x) => x.text)).toContain('jon');
  });

  it('never duplicates the replaced words when timing has drifted', () => {
    const { t, w } = live();
    const { transcript: c } = applyCorrection(t, { wordIds: ids(w, 3, 5), replacement: 'John' });
    const next = applyFinalPass(c, {
      ...finalPass('we should ask john smith about the budget before friday', 3000),
      speakers: finalSpeakers,
    });
    expect(shown(next)).toBe('we should ask John about the budget before friday');
    const frozen = next.segments
      .flatMap((s) => s.words)
      .filter((x) => c.corrections[0]!.wordIds.includes(x.id));
    expect(frozen[0]?.startMs).toBe(4500);
    expect(frozen.map((x) => x.text)).toEqual(['jon', 'smith']);
  });

  it('survives when the final pass finds no text there at all', () => {
    const { t, w } = live();
    const { transcript: c } = applyCorrection(t, { wordIds: ids(w, 3, 5), replacement: 'John' });
    const empty = applyFinalPass(c, { segments: [], speakers: [] });
    expect(shown(empty)).toBe('John');
    expectSurvives(c, empty);
    const elsewhere = applyFinalPass(c, {
      ...finalPass('completely different words', 600_000),
      speakers: finalSpeakers,
    });
    expectSurvives(c, elsewhere);
    expect(shown(elsewhere)).toBe('John completely different words');
  });

  it('keeps adjacent and multiple corrections, in order, through repeated final passes', () => {
    const { t, w } = live();
    const a = applyCorrection(t, { wordIds: ids(w, 3, 4), replacement: 'John' });
    const b = applyCorrection(a.transcript, { wordIds: ids(w, 4, 5), replacement: 'Smythe' });
    const c = applyCorrection(b.transcript, { wordIds: ids(w, 9, 10), replacement: 'Monday' });
    const once = applyFinalPass(c.transcript, {
      ...finalPass('we should ask john smith about the budget before friday'),
      speakers: finalSpeakers,
    });
    expect(shown(once)).toBe('we should ask John Smythe about the budget before Monday');
    const twice = applyFinalPass(once, {
      segments: [
        segment(
          'f2',
          'G',
          words('we should ask jon smyth about a budget by friday', 200, 'g'),
          'final',
        ),
      ],
      speakers: [speaker('G')],
    });
    expect(shown(twice)).toBe('we should ask John Smythe about a budget by Monday');
    expectSurvives(c.transcript, twice);
  });

  it('a frozen word stays frozen even if the worker reuses its id', () => {
    const { t, w } = live();
    const { transcript: c } = applyCorrection(t, { wordIds: ids(w, 3, 4), replacement: 'John' });
    const reuse = { ...w[3]!, text: 'MODEL WINS' };
    const next = applyFinalPass(c, {
      segments: [segment('f', 'F', [reuse], 'final')],
      speakers: finalSpeakers,
    });
    expect(next.segments.flatMap((s) => s.words).find((x) => x.id === w[3]!.id)?.text).toBe('jon');
  });

  it('reverted corrections do not freeze their words', () => {
    const { t, w } = live();
    const a = applyCorrection(t, { wordIds: ids(w, 3, 4), replacement: 'John' });
    const reverted = revertCorrection(a.transcript, a.correction.id);
    const next = applyFinalPass(reverted, {
      ...finalPass('we should ask john'),
      speakers: finalSpeakers,
    });
    expect(shown(next)).toBe('we should ask john');
    expect(next.corrections).toHaveLength(1);
  });

  it('keeps tracks apart: a mic correction is untouched by meeting text at the same time', () => {
    const { t } = live();
    const mic = words('yes i agree', 1000, 'mic');
    const both = appendSegments(
      t,
      [segment('m', 'you', mic, 'live', 'microphone')],
      [speaker('you', 'You')],
    );
    const { transcript: c } = applyCorrection(both, {
      wordIds: [mic[2]!.id],
      replacement: 'concur',
    });
    const next = applyFinalPass(c, {
      segments: [
        segment('f1', 'F', words('we should ask john smith', 0, 'f'), 'final'),
        segment('f2', 'you', words('yes i agree', 1000, 'f'), 'final', 'microphone'),
      ],
      speakers: [speaker('F'), speaker('you', 'You')],
    });
    expect(shown(next)).toContain('yes i concur');
    expectSurvives(c, next);
  });

  it('survives a randomised stress run at 100%', () => {
    let seed = 42;
    const rand = (n: number): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    const vocab = 'the a project budget meeting friday team plan risk scope ship ok yes no'.split(
      ' ',
    );
    const text = (n: number): string =>
      Array.from({ length: n }, () => vocab[rand(vocab.length)]).join(' ');
    for (let round = 0; round < 40; round += 1) {
      const liveWords = words(text(300), 0);
      let t = transcript([segment('s', 'a', liveWords)], [speaker('a')]);
      for (let i = 0; i < 25; i += 1) {
        const start = rand(290);
        const span = ids(liveWords, start, start + 1 + rand(6));
        try {
          t = applyCorrection(t, { wordIds: span, replacement: `fix${i}` }).transcript;
        } catch (error) {
          expect(error).toBeInstanceOf(CorrectionConflictError);
        }
      }
      const offset = rand(4000) - 2000;
      const finalWords = words(text(150 + rand(300)), Math.max(0, offset), 'f');
      const next = applyFinalPass(t, {
        segments: [segment('f', 'F', finalWords, 'final')],
        speakers: [speaker('F')],
      });
      expectSurvives(t, next);
      const token = resolveDisplay(next).flatMap((s) => s.tokens);
      const expected = t.corrections.filter((c) => c.state === 'active').map((c) => c.replacement);
      expect(
        token
          .filter((x) => x.correctionId !== null)
          .map((x) => x.text)
          .sort(),
      ).toEqual(expected.sort());
    }
  });

  it('live revisions obey the same rule', () => {
    const { t, w } = live();
    const { transcript: c } = applyCorrection(t, { wordIds: ids(w, 3, 5), replacement: 'John' });
    const next = replaceLiveSegments(c, ['s1'], {
      segments: [segment('s2', 'a', words('we should ask jon smith about budgets', 0, 'r'))],
    });
    expect(shown(next)).toBe('we should ask John about budgets');
    expect(next.undoStack).toEqual(c.undoStack);
  });
});

describe('speakers', () => {
  it('reassigning a span splits the display and undoes cleanly', () => {
    const { t, w } = live();
    const withB = { ...t, speakers: [...t.speakers, speaker('b')] };
    const moved = reassignSpeaker(withB, ids(w, 2, 5), 'b');
    expect(resolveDisplay(moved).map((s) => s.speakerId)).toEqual(['a', 'b', 'a']);
    expect(resolveDisplay(undo(moved)).map((s) => s.speakerId)).toEqual(['a']);
  });

  it('merges speakers, refuses a loop', () => {
    const t = transcript(
      [segment('1', 'a', words('one', 0)), segment('2', 'b', words('two', 500))],
      [speaker('a'), speaker('b')],
    );
    const merged = mergeSpeakers(t, 'b', 'a');
    expect(resolveDisplay(merged).map((s) => s.speakerId)).toEqual(['a', 'a']);
    expect(activeSpeakers(merged).map((s) => s.id)).toEqual(['a']);
    expect(() => mergeSpeakers(merged, 'a', 'b')).toThrow(CorrectionConflictError);
  });

  it('the final pass keeps user names, merges and reassignments', () => {
    const t = transcript(
      [
        segment('1', 'a', words('one two three four', 0)),
        segment('2', 'b', words('five six seven eight', 2000)),
        segment('3', 'c', words('nine ten', 4000)),
      ],
      [speaker('a'), speaker('b'), speaker('c')],
    );
    const named = renameSpeaker(t, 'a', 'Alice');
    const merged = mergeSpeakers(named, 'c', 'a');
    const ten = t.segments[2]!.words[1]!;
    const final = applyFinalPass(reassignSpeaker(merged, [ten.id], 'b'), {
      segments: [
        segment('f1', 'X', words('one two three four', 0, 'f'), 'final'),
        segment('f2', 'Y', words('five six seven eight', 2000, 'f'), 'final'),
        segment('f3', 'Z', words('nine ten', 4000, 'f'), 'final'),
      ],
      speakers: [speaker('X'), speaker('Y'), speaker('Z')],
    });
    const x = final.speakers.find((s) => s.id === 'X');
    expect(x).toMatchObject({ name: 'Alice', userNamed: true });
    expect(final.speakers.find((s) => s.id === 'Z')?.mergedInto).toBe('X');
    const display = resolveDisplay(final);
    expect(display.map((s) => s.speakerId)).toEqual(['X', 'Y', 'X', 'Y']);
    expect(final.undoStack).toEqual([]);
  });

  it('keeps undo and redo of a correction through a final pass', () => {
    const t = transcript([segment('1', 'a', words('one two', 0))], [speaker('a')]);
    const two = t.segments[0]!.words[1]!;
    const edited = applyCorrection(t, { wordIds: [two.id], replacement: 'Twain' }).transcript;
    const final = applyFinalPass(edited, {
      segments: [segment('f1', 'X', words('won too', 0, 'f'), 'final')],
      speakers: [speaker('X')],
    });
    expect(final.undoStack).toHaveLength(1);
    const undone = undo(final);
    expect(shown(undone)).not.toContain('Twain');
    expect(shown(redo(undone))).toContain('Twain');
  });
});
