import { expect, it } from 'vitest';
import {
  mergeLiveSpeaker,
  mergeSpeakers,
  renameSpeaker,
  reassignSpeaker,
  resolveSpeakerId,
  resolveDisplay,
  applyCorrection,
} from '../src/corrections.ts';
import { Library } from '../src/library.ts';
import { speaker, segment, words, transcript, tempDir } from './helpers.ts';
const run = 'invented-1';
const a = `${run}-live-1`,
  b = `${run}-live-2`,
  c = `${run}-live-3`;
const request = (from = a, into = b, order = 1) => ({
  from,
  into,
  order,
  workerRun: run,
  generation: 0,
  label: 'Speaker 1',
});
function seed() {
  return transcript(
    Array.from({ length: 70 }, (_, i) =>
      segment(`s${i}`, [a, b, c][i % 3]!, words(`raw ${i}`, i * 1000)),
    ),
    [a, b, c].map((id) => speaker(id, 'Speaker ?')),
  );
}
it('resolves late A→B→C beyond 64 parents, promotes, and leaves every raw layer intact', () => {
  const before = seed();
  const mid = mergeLiveSpeaker(before, request());
  const after = mergeLiveSpeaker(mid, request(b, c, 2));
  expect(resolveSpeakerId(after, a)).toBe(c);
  expect(after.speakers.find((s) => s.id === c)?.label).toBe('Speaker 1');
  for (const key of [
    'segments',
    'gaps',
    'corrections',
    'speakerOverrides',
    'undoStack',
    'redoStack',
  ] as const)
    expect(after[key]).toBe(before[key]);
  expect(resolveDisplay(after).every((s) => s.speakerId === c)).toBe(true);
  expect(mergeLiveSpeaker(after, request(c, a, 3))).toBe(after);
  expect(mergeLiveSpeaker(after, request())).toBe(after);
  expect(mergeLiveSpeaker(after, request(a, c, 0))).toBe(after);
});
it('handles delivery in reverse chain order without a cycle or rewriting raw IDs', () => {
  const before = seed();
  const after = mergeLiveSpeaker(mergeLiveSpeaker(before, request(b, c, 2)), request());
  expect(resolveSpeakerId(after, a)).toBe(c);
  expect(after.segments).toBe(before.segments);
});
it.each(['rename', 'profile', 'override', 'manual', 'history', 'redo'] as const)(
  'protects both sides and connected aliases for %s',
  (kind) => {
    let t = seed();
    if (kind === 'rename') t = renameSpeaker(t, b, 'Owner choice');
    if (kind === 'profile')
      t = {
        ...t,
        speakers: t.speakers.map((s) => (s.id === b ? { ...s, profileId: 'profile' } : s)),
      };
    if (kind === 'override') t = reassignSpeaker(t, [t.segments[1]!.words[0]!.id], b);
    if (kind === 'manual') {
      t = mergeSpeakers(t, b, c);
      t = { ...t, undoStack: [] };
    }
    if (kind === 'history' || kind === 'redo') {
      t = renameSpeaker(t, b, 'Earlier name');
      t = {
        ...t,
        speakers: seed().speakers,
        ...(kind === 'redo' ? { redoStack: t.undoStack, undoStack: [] } : {}),
      };
    }
    expect(mergeLiveSpeaker(t, request())).toBe(t);
    expect(mergeLiveSpeaker(t, request(b, a))).toBe(t);
  },
);
it('rejects dangling IDs, cross-run IDs, invalid requests and final transition', () => {
  const t = seed();
  for (const r of [
    request(a, `${run}-live-99`),
    { ...request(), workerRun: 'invented-2' },
    request(a, a),
    { ...request(), generation: -1 },
  ])
    expect(mergeLiveSpeaker(t, r)).toBe(t);
  const final = { ...t, segments: t.segments.map((s) => ({ ...s, pass: 'final' as const })) };
  expect(mergeLiveSpeaker(final, request())).toBe(final);
});
it('keeps corrections and overlapping user overrides, including their history', () => {
  const t = seed();
  const corrected = applyCorrection(t, {
    wordIds: [t.segments[0]!.words[0]!.id],
    replacement: 'Fixed',
  }).transcript;
  const merged = mergeLiveSpeaker(corrected, request());
  expect(merged.corrections).toBe(corrected.corrections);
  expect(merged.undoStack).toBe(corrected.undoStack);
  expect(merged.segments).toBe(corrected.segments);
});
it('saves atomically, rejects stale/duplicate writes, and preserves provenance on reopening', async () => {
  const root = await tempDir();
  let lib = await Library.open({ root });
  const { id } = await lib.createMeeting({ title: 'Invented', date: '2026-11-11' });
  const t = seed();
  const initial = await lib.appendSegments(id, t.segments, t.speakers);
  await expect(
    lib.mergeLiveSpeaker(id, request(), initial.revision, {
      onStep: (step) => {
        if (step === 'temp-synced') throw Error('injected');
      },
    }),
  ).rejects.toThrow('injected');
  expect((await lib.readTranscript(id)).revision).toBe(initial.revision);
  const saved = await lib.mergeLiveSpeaker(id, request(), initial.revision);
  await expect(lib.mergeLiveSpeaker(id, request(b, c, 2), initial.revision)).rejects.toThrow();
  expect((await lib.mergeLiveSpeaker(id, request(), saved.revision)).revision).toBe(saved.revision);
  await lib.close();
  lib = await Library.open({ root });
  const reopened = await lib.readTranscript(id);
  expect(reopened.speakers.find((s) => s.id === a)?.modelMerge?.workerRun).toBe(run);
  const chained = await lib.mergeLiveSpeaker(id, request(b, c, 2), reopened.revision);
  expect(resolveSpeakerId(chained, a)).toBe(c);
  expect(chained.segments).toEqual(initial.segments);
  await lib.close();
});
