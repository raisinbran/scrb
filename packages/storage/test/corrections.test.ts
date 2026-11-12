import { describe, expect, it } from 'vitest';
import {
  activeSpeakers,
  appendSegments,
  applyCorrection,
  applyFinalPass,
  frozenWordIds,
  mergeSpeakers,
  assignSpeakerProfiles,
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
import type { Segment, Speaker } from '../src/formats/transcript.ts';
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

  it('cross-segment correction uses the final selected word time, including after model retiming', () => {
    const first = words('please ask', 0);
    const second = words('john today', 1000);
    const original = transcript(
      [segment('first', 'a', first), segment('second', 'a', second)],
      [speaker('a')],
    );
    const ids = [first[1]!.id, second[0]!.id];
    const corrected = applyCorrection(original, { wordIds: ids, replacement: 'ask Jane' });
    const view = resolveDisplay(corrected.transcript).flatMap((s) => s.tokens);
    const selected = view.find((token) => token.correctionId === corrected.correction.id);
    expect(selected?.startMs).toBe(first[1]?.startMs);
    expect(selected?.endMs).toBe(second[0]?.endMs);
    expect(shown(corrected.transcript)).toBe('please ask Jane today');
    expect(shown(undo(corrected.transcript))).toBe('please ask john today');
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

/** One-second words covering [fromMs, toMs); `lengthMs` shortens the last word to hit odd ends. */
function talk(fromMs: number, toMs: number, prefix: string, track: Segment['track'] = 'meeting') {
  const list: Word[] = [];
  for (let at = fromMs, n = 0; at < toMs; at += 1000, n += 1) {
    list.push({
      id: `${prefix}${n}`,
      text: `${prefix}${n}`,
      startMs: at,
      endMs: Math.min(at + 1000, toMs),
    });
  }
  return { list, track };
}
const seg = (
  id: string,
  who: string,
  from: number,
  to: number,
  pass: Segment['pass'] = 'live',
  track: Segment['track'] = 'meeting',
): Segment => segment(id, who, talk(from, to, id).list, pass, track);
const named = (id: string, name: string): Speaker => ({ ...speaker(id), name, userNamed: true });
const finalOf = (t: TranscriptFile, ...finals: Segment[]) =>
  applyFinalPass(t, {
    segments: finals,
    speakers: [...new Set(finals.map((f) => f.speakerId))].map((id) => speaker(id)),
  });
const find = (t: TranscriptFile, id: string) => t.speakers.find((s) => s.id === id);

describe('slice 2b: names across the final pass', () => {
  const live20 = (): TranscriptFile =>
    transcript([seg('l', 'a', 0, 20_000)], [named('a', 'Alice')]);

  it('transfers a name (not the profile) and removes the live record', () => {
    const t = live20();
    t.speakers[0]!.profileId = 'p1';
    const out = finalOf(t, seg('f', 'X', 0, 20_000, 'final'));
    expect(find(out, 'X')).toMatchObject({ name: 'Alice', userNamed: true, profileId: null });
    expect(find(out, 'a')).toBeUndefined();
    expect(resolveDisplay(out).map((s) => s.speakerId)).toEqual(['X']);
  });

  it('needs 10 s of shared speech', () => {
    const ok = finalOf(
      transcript([seg('l', 'a', 0, 10_000)], [named('a', 'A')]),
      seg('f', 'X', 0, 10_000, 'final'),
    );
    expect(find(ok, 'X')?.name).toBe('A');
    const short = finalOf(
      transcript([seg('l', 'a', 0, 9_990)], [named('a', 'A')]),
      seg('f', 'X', 0, 9_990, 'final'),
    );
    expect(find(short, 'X')?.name).toBeNull();
    expect(find(short, 'a')).toMatchObject({ name: 'A', needsManualResolution: true });
  });

  it('needs 70% of the live speaker covered', () => {
    const ok = finalOf(live20(), seg('f', 'X', 0, 14_000, 'final'));
    expect(find(ok, 'X')?.name).toBe('Alice');
    const low = finalOf(live20(), seg('f', 'X', 0, 13_990, 'final'));
    expect(find(low, 'X')?.name).toBeNull();
    expect(find(low, 'a')?.needsManualResolution).toBe(true);
  });

  it('needs a 20-point margin over the next-best final speaker', () => {
    // X covers 70%, Y covers 50%: exactly 20 points.
    const ok = finalOf(
      live20(),
      seg('f1', 'X', 0, 14_000, 'final'),
      seg('f2', 'Y', 10_000, 20_000, 'final'),
    );
    expect(find(ok, 'X')?.name).toBe('Alice');
    const close = finalOf(
      live20(),
      seg('f1', 'X', 0, 14_000, 'final'),
      seg('f2', 'Y', 9_990, 20_000, 'final'),
    );
    expect(find(close, 'X')?.name).toBeNull();
    expect(find(close, 'a')?.needsManualResolution).toBe(true);
  });

  it('two named speakers on one final speaker: one wins, the other goes to review', () => {
    const t = transcript(
      [seg('l1', 'a', 0, 22_000), seg('l2', 'b', 22_000, 42_000)],
      [named('a', 'Alice'), named('b', 'Bob')],
    );
    const out = finalOf(t, seg('f', 'X', 0, 42_000, 'final'));
    expect(find(out, 'X')?.name).toBe('Alice');
    expect(find(out, 'b')).toMatchObject({
      name: 'Bob',
      userNamed: true,
      needsManualResolution: true,
    });
    expect(find(out, 'b')?.mergedInto).toBeNull();
    expect(
      activeSpeakers(out)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['X', 'b']);
  });

  it('one named speaker spanning two finals keeps them distinct and is flagged', () => {
    const out = finalOf(
      live20(),
      seg('f1', 'X', 0, 10_000, 'final'),
      seg('f2', 'Y', 10_000, 20_000, 'final'),
    );
    expect(find(out, 'X')).toMatchObject({ name: null, mergedInto: null });
    expect(find(out, 'Y')).toMatchObject({ name: null, mergedInto: null });
    expect(find(out, 'a')).toMatchObject({
      name: 'Alice',
      mergedInto: null,
      needsManualResolution: true,
    });
    expect(
      activeSpeakers(out)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['X', 'Y', 'a']);
  });

  it('ignores microphone speech and the generic meeting speaker', () => {
    const t = transcript([seg('l', 'a', 0, 10_000)], [named('a', 'Alice')]);
    const out = finalOf(
      t,
      seg('f1', 'X', 0, 5_000, 'final'),
      seg('f2', 'X', 5_000, 10_000, 'final', 'microphone'),
    );
    expect(find(out, 'X')?.name).toBeNull();
    expect(find(out, 'a')?.needsManualResolution).toBe(true);
    const mic = transcript([seg('m', 'a', 0, 20_000, 'live', 'microphone')], [named('a', 'Alice')]);
    expect(
      find(finalOf(mic, seg('f', 'X', 0, 20_000, 'final', 'microphone')), 'a')
        ?.needsManualResolution,
    ).toBeUndefined();
    const generic = transcript(
      [seg('l', 'meeting', 0, 20_000)],
      [{ ...named('meeting', 'Nobody') }],
    );
    const g = finalOf(generic, seg('f', 'X', 0, 20_000, 'final'));
    expect(find(g, 'X')?.name).toBeNull();
    expect(find(g, 'meeting')?.needsManualResolution).toBeUndefined();
  });

  it('counts overlapping words once', () => {
    // 10 words but only 5 s of distinct time.
    const doubled = [...talk(0, 5_000, 'p').list, ...talk(0, 5_000, 'q').list];
    const t = transcript([segment('l', 'a', doubled)], [named('a', 'Alice')]);
    const out = finalOf(t, seg('f', 'X', 0, 5_000, 'final'));
    expect(find(out, 'X')?.name).toBeNull();
  });

  describe('review flag', () => {
    const flagged = (): TranscriptFile =>
      finalOf(
        live20(),
        seg('f1', 'X', 0, 10_000, 'final'),
        seg('f2', 'Y', 10_000, 20_000, 'final'),
      );

    it('clears on a merge either way; not on rename, reassign, profile matching or another pass', () => {
      expect(find(mergeSpeakers(flagged(), 'a', 'X'), 'a')?.needsManualResolution).toBeUndefined();
      expect(find(mergeSpeakers(flagged(), 'X', 'a'), 'a')?.needsManualResolution).toBeUndefined();
      const f = flagged();
      expect(find(renameSpeaker(f, 'a', 'Alicia'), 'a')?.needsManualResolution).toBe(true);
      const word = f.segments.find((s) => s.speakerId === 'Y')!.words[0]!;
      const moved = reassignSpeaker(f, [word.id], 'a');
      expect(find(moved, 'a')?.needsManualResolution).toBe(true);
      const matched = assignSpeakerProfiles(f, [{ speakerId: 'a', profileId: 'p', name: 'Zed' }]);
      expect(find(matched, 'a')?.needsManualResolution).toBe(true);
      const again = finalOf(
        f,
        seg('g1', 'X', 0, 10_000, 'final'),
        seg('g2', 'Y', 10_000, 20_000, 'final'),
      );
      expect(find(again, 'a')).toMatchObject({ name: 'Alice', needsManualResolution: true });
      const merged = mergeSpeakers(f, 'a', 'X');
      expect(find(undo(merged), 'a')?.needsManualResolution).toBe(true);
    });

    it('a flagged speaker merged away is not listed', () => {
      expect(
        activeSpeakers(mergeSpeakers(flagged(), 'a', 'X'))
          .map((s) => s.id)
          .sort(),
      ).toEqual(['X', 'Y']);
    });
  });

  describe('history', () => {
    const setup = (): TranscriptFile => {
      const t = transcript(
        [seg('l1', 'a', 0, 20_000), seg('l2', 'b', 20_000, 40_000)],
        [speaker('a'), speaker('b')],
      );
      const one = renameSpeaker(renameSpeaker(t, 'a', 'Alice'), 'b', 'Bob');
      const word = one.segments[0]!.words[2]!;
      return reassignSpeaker(one, [word.id], 'b');
    };
    const finals = [seg('f1', 'X', 0, 20_000, 'final'), seg('f2', 'Y', 20_000, 40_000, 'final')];

    it('rebases speaker and override undo/redo onto the final speakers', () => {
      const before = setup();
      const out = finalOf(before, ...finals);
      expect(out.undoStack.map((e) => e.id)).toEqual(before.undoStack.map((e) => e.id));
      expect(out.speakerOverrides.map((o) => o.speakerId)).toEqual(['Y']);
      const undone = undo(out);
      expect(undone.speakerOverrides).toEqual([]);
      const twice = undo(undo(undone));
      expect(find(twice, 'X')?.name).toBeNull();
      expect(find(twice, 'X')?.label).toBe('X');
      expect(find(twice, 'Y')?.name).toBeNull();
      expect(find(redo(redo(twice)), 'X')?.name).toBe('Alice');
      const all = redo(redo(redo(twice)));
      expect(find(all, 'Y')).toMatchObject({ name: 'Bob', userNamed: true });
      expect(all.speakerOverrides.map((o) => o.speakerId)).toEqual(['Y']);
      expect(all.redoStack).toEqual([]);
    });

    it('keeps the undo vs redo distinction', () => {
      const out = finalOf(undo(setup()), ...finals);
      expect(out.undoStack).toHaveLength(2);
      expect(out.redoStack).toHaveLength(1);
      expect(redo(out).speakerOverrides.map((o) => o.speakerId)).toEqual(['Y']);
    });

    it('drops an unsafe entry and every entry sharing its speaker or override, keeping the rest in order', () => {
      const base = setup();
      const entry = (id: string, patch: Partial<TranscriptFile['undoStack'][number]>) => ({
        id,
        label: id,
        corrections: [],
        speakers: [],
        overrides: [],
        ...patch,
      });
      const ghost = { ...speaker('g1'), mergedInto: 'missing' };
      const override = {
        id: 'o1',
        track: 'meeting' as const,
        startMs: 0,
        endMs: 1,
        speakerId: 'g1',
      };
      const bad = entry('bad', { speakers: [{ id: 'g1', before: null, after: ghost }] });
      const linked = entry('linked', { overrides: [{ id: 'o1', before: null, after: override }] });
      const viaOverride = entry('via', {
        overrides: [{ id: 'o1', before: override, after: null }],
      });
      const t: TranscriptFile = {
        ...base,
        undoStack: [base.undoStack[0]!, bad, base.undoStack[1]!, linked, base.undoStack[2]!],
        redoStack: [
          viaOverride,
          entry('keep', {
            speakers: [{ id: 'b', before: find(base, 'b')!, after: find(base, 'b')! }],
          }),
        ],
      };
      const out = finalOf(t, ...finals);
      expect(out.undoStack.map((e) => e.id)).toEqual(base.undoStack.map((e) => e.id));
      expect(out.redoStack.map((e) => e.id)).toEqual(['keep']);
      expect(find(out, 'Y')?.name).toBe('Bob');
      expect(out.speakerOverrides.map((o) => o.speakerId)).toEqual(['Y']);
    });

    it('keeps current decisions when an entry is dropped', () => {
      const base = setup();
      const t = {
        ...base,
        undoStack: [
          {
            ...base.undoStack[0]!,
            speakers: [{ id: 'z', before: { ...speaker('z'), mergedInto: 'nope' }, after: null }],
          },
        ],
      };
      const out = finalOf(t, ...finals);
      expect(out.undoStack).toEqual([]);
      expect(find(out, 'X')?.name).toBe('Alice');
    });
  });

  describe('second final pass', () => {
    it('re-keys a colliding speaker-1 and moves the name when safe', () => {
      const first = finalOf(live20(), seg('f', 'speaker-1', 0, 20_000, 'final'));
      expect(find(first, 'speaker-1')?.name).toBe('Alice');
      const renamed = renameSpeaker(first, 'speaker-1', 'Alicia');
      const second = finalOf(renamed, seg('g', 'speaker-1', 0, 20_000, 'final'));
      expect(second.segments.map((s) => s.speakerId)).toEqual(['final:1:speaker-1']);
      expect(find(second, 'final:1:speaker-1')).toMatchObject({ name: 'Alicia', userNamed: true });
      expect(find(second, 'speaker-1')).toBeUndefined();
      expect(undo(second).speakers.find((s) => s.id === 'final:1:speaker-1')?.name).toBe('Alice');
    });

    it('keeps the old speaker-1 and its history apart from an unrelated new speaker-1', () => {
      const first = finalOf(live20(), seg('f', 'speaker-1', 0, 20_000, 'final'));
      const second = finalOf(
        first,
        seg('g1', 'speaker-1', 0, 10_000, 'final'),
        seg('g2', 'speaker-2', 10_000, 20_000, 'final'),
      );
      expect(find(second, 'speaker-1')).toMatchObject({
        name: 'Alice',
        needsManualResolution: true,
      });
      const fresh = second.segments.find(
        (s) => s.speakerId !== 'speaker-1' && s.words[0]!.startMs === 0,
      )!;
      expect(fresh.speakerId).toBe('final:1:speaker-1');
      expect(find(second, fresh.speakerId)?.name).toBeNull();
      expect(find(second, 'speaker-2')?.name).toBeNull();
    });
  });
});

describe('reserved microphone speaker through the final pass', () => {
  it('keeps one renamed you, never re-keys it, and leaves other collisions re-keyed', () => {
    const t = transcript(
      [seg('m', 'you', 0, 5_000, 'live', 'microphone'), seg('l', 'speaker-1', 0, 5_000)],
      [{ ...speaker('you'), name: 'Brandon', userNamed: true }, speaker('speaker-1')],
    );
    const renamed = renameSpeaker(t, 'you', 'Brandon C');
    const out = applyFinalPass(renamed, {
      segments: [
        seg('fm', 'you', 0, 5_000, 'final', 'microphone'),
        seg('fl', 'speaker-1', 0, 5_000, 'final'),
      ],
      speakers: [speaker('you'), speaker('speaker-1')],
    });
    expect(out.speakers.filter((s) => s.id === 'you')).toHaveLength(1);
    expect(out.speakers.some((s) => s.id.includes(':you'))).toBe(false);
    expect(find(out, 'you')).toMatchObject({ name: 'Brandon C', userNamed: true });
    expect(out.segments.find((s) => s.track === 'microphone')?.speakerId).toBe('you');
    expect(out.segments.find((s) => s.track === 'meeting')?.speakerId).toBe('final:1:speaker-1');
    expect(out.undoStack).toHaveLength(1);
    expect(find(undo(out), 'you')?.name).toBe('Brandon');
  });

  it('never maps you to a final meeting speaker, even with 10 s of speech reassigned to it', () => {
    const t = transcript(
      [seg('m', 'you', 0, 5_000, 'live', 'microphone'), seg('l', 'speaker-1', 0, 20_000)],
      [{ ...speaker('you'), name: 'Brandon', userNamed: true }, speaker('speaker-1')],
    );
    const words = t.segments.find((s) => s.track === 'meeting')!.words;
    const moved = reassignSpeaker(t, [words[0]!.id, ...words.slice(1).map((w) => w.id)], 'you');
    const out = applyFinalPass(moved, {
      segments: [
        seg('fm', 'you', 0, 5_000, 'final', 'microphone'),
        seg('fl', 'speaker-2', 0, 20_000, 'final'),
      ],
      speakers: [speaker('you'), speaker('speaker-2')],
    });
    expect(out.speakers.filter((s) => s.id === 'you')).toHaveLength(1);
    expect(out.segments.find((s) => s.track === 'microphone')?.speakerId).toBe('you');
    expect(find(out, 'you')).toMatchObject({ name: 'Brandon', userNamed: true });
    expect(find(out, 'speaker-2')?.name).toBeNull();
    expect(out.undoStack).toHaveLength(1);
    expect(out.undoStack[0]?.overrides[0]?.after?.speakerId).toBe('you');
    expect(undo(out).speakerOverrides).toEqual([]);
  });
});
