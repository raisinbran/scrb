import { describe, expect, it } from 'vitest';
import { ContractError, isValidRequest, type SummaryItemUpdate } from '@scrb/contracts';
import { mergeRegeneratedSummary, SUMMARY_FORMAT, type SummaryFile } from '@scrb/storage';
import type { BaseItem, MeetingSummary } from '../../summary/src/types.ts';
import {
  DROPPED_ITEMS_WARNING,
  IMPACTS_HEADING,
  applySummaryUpdate,
  guardSummaryLinks,
  toGeneratedSummary,
  toSummaryDoc,
} from './summary.ts';

const AT = '2026-10-30T12:00:00Z';

function base(id: string, text: string, seconds: number): BaseItem {
  return {
    id,
    text,
    evidence: { lineIndex: 0, timestampSec: seconds },
    alsoAt: [],
    flags: [],
    pass: 'test',
  };
}

function engineSummary(): MeetingSummary {
  return {
    schemaVersion: 1,
    sourceHash: 'hash',
    model: 'test',
    body: {
      length: 'full',
      overview: 'The team met.',
      mainTopics: [{ title: 'Budget', summary: 'Costs rose.' }],
    },
    actions: [
      {
        ...base('a-1', 'Send the estimate', 12.5),
        kind: 'action',
        owner: 'Priya',
        deadline: 'Friday',
        status: 'Agreed',
        alsoAt: [{ lineIndex: 4, timestampSec: 90 }],
      },
      {
        ...base('a-2', 'Check approval', 20),
        kind: 'action',
        owner: 'Unconfirmed',
        deadline: 'Not specified',
        status: 'Proposed',
        flags: ['owner_unconfirmed', 'weak_evidence'],
      },
    ],
    decisions: [
      {
        ...base('d-1', 'Move the review', 30),
        kind: 'decision',
        status: 'Tentatively agreed',
        impactArea: 'Technical approach',
      },
      {
        ...base('d-2', 'Keep the rota', 40),
        kind: 'decision',
        status: 'Unresolved',
        impactArea: 'Not specified',
        flags: ['conflict'],
      },
    ],
    impacts: [
      {
        ...base('i-1', 'Launch slips', 50),
        kind: 'impact',
        impactArea: 'Schedule',
        basis: 'Stated',
      },
      { ...base('i-2', 'Costs rise', 60), kind: 'impact', impactArea: 'Cost', basis: 'Inferred' },
    ],
    openQuestions: [{ ...base('q-1', 'Who owns it?', 70), kind: 'openQuestion' }],
    warnings: ['Part of the meeting could not be read.'],
  };
}

function stored(summary = engineSummary()): SummaryFile {
  return {
    ...toGeneratedSummary(summary, AT),
    schemaVersion: 3,
    meetingId: 'm-1',
    revision: 1,
    transcriptRevision: 1,
    outdated: false,
  };
}

describe('summary engine to the UI contract', () => {
  const doc = toSummaryDoc('m-1', stored());

  it('keeps every action field, and agreement never reads as completion', () => {
    expect(doc.actionItems).toEqual([
      {
        id: 'a-1',
        action: 'Send the estimate',
        owner: 'Priya',
        ownerUnconfirmed: false,
        deadline: 'Friday',
        deadlineUnconfirmed: false,
        status: 'agreed',
        sourceMs: 12_500,
        alsoAtMs: [90_000],
        needsReview: false,
        edited: false,
      },
      {
        id: 'a-2',
        action: 'Check approval',
        owner: null,
        ownerUnconfirmed: true,
        deadline: null,
        deadlineUnconfirmed: false,
        status: 'proposed',
        sourceMs: 20_000,
        alsoAtMs: [],
        needsReview: true,
        edited: false,
      },
    ]);
  });

  it('maps decision statuses and impact areas', () => {
    expect(
      doc.decisions.map(({ status, impactArea, needsReview }) => [status, impactArea, needsReview]),
    ).toEqual([
      ['tentativelyAgreed', 'technicalApproach', false],
      ['unresolved', null, true],
    ]);
  });

  it('gives open questions an id and a source', () => {
    expect(doc.openQuestions[0]).toMatchObject({
      id: 'q-1',
      question: 'Who owns it?',
      sourceMs: 70_000,
    });
  });

  it('keeps warnings', () => {
    expect(doc.warnings).toEqual(['Part of the meeting could not be read.']);
  });

  it('keeps impacts in the full summary and labels inferred ones', () => {
    const impacts = doc.narrative.full?.find((section) => section.heading === IMPACTS_HEADING);
    expect(impacts?.text).toBe('Launch slips\nInferred: Costs rise');
    expect(doc.narrative.brief).toBeNull();
  });

  it('splits a brief summary into paragraphs and leaves the full one null', () => {
    const summary = engineSummary();
    summary.body = { length: 'brief', paragraphs: ['One.', 'Two.'] };
    const brief = toSummaryDoc('m-1', stored(summary));
    expect(brief.narrative.brief?.map((section) => section.text)).toEqual(['One.', 'Two.']);
    expect(brief.narrative.full).toBeNull();
  });

  it('produces items the contract validator accepts back from the UI', () => {
    const update: SummaryItemUpdate = { kind: 'actionItem', item: doc.actionItems[1]! };
    expect(isValidRequest('updateSummaryItem', { meetingId: 'm-1', update })).toBe(true);
  });
});

function updates(doc: ReturnType<typeof toSummaryDoc>): SummaryItemUpdate[] {
  const narrative = [...(doc.narrative.brief ?? []), ...(doc.narrative.full ?? [])];
  return [
    ...narrative.map((item): SummaryItemUpdate => ({ kind: 'narrative', item })),
    ...doc.actionItems.map((item): SummaryItemUpdate => ({ kind: 'actionItem', item })),
    ...doc.decisions.map((item): SummaryItemUpdate => ({ kind: 'decision', item })),
    ...doc.openQuestions.map((item): SummaryItemUpdate => ({ kind: 'openQuestion', item })),
  ];
}

describe('summary item additions and removals', () => {
  it('generates a backend-owned id and evidence, then removes only the selected item', () => {
    const original = stored();
    const added = applySummaryUpdate(original, {
      kind: 'add',
      collection: 'actionItems',
      item: {
        action: 'Invented extra task',
        owner: null,
        ownerUnconfirmed: false,
        deadline: null,
        deadlineUnconfirmed: false,
        status: 'proposed',
        sourceMs: 0,
      },
    });
    const item = added.actionItems.at(-1)!;
    expect(item).toMatchObject({
      action: 'Invented extra task',
      sourceMs: 0,
      edited: true,
      alsoAtMs: [],
      needsReview: false,
    });
    expect(item.id).toBeTruthy();
    expect(original.actionItems.some((value) => value.id === item.id)).toBe(false);
    const removed = applySummaryUpdate(added, {
      kind: 'remove',
      collection: 'actionItems',
      itemId: item.id,
    });
    expect(removed.actionItems).toEqual(original.actionItems);
    expect(removed.decisions).toEqual(original.decisions);
    expect(() =>
      applySummaryUpdate(original, {
        kind: 'remove',
        collection: 'decisions',
        itemId: item.id,
      }),
    ).toThrow(ContractError);
  });
});

describe('what the UI sends back', () => {
  const meetingId = '6f1c2b1e-7a44-4f6e-9a55-0f5d8c1e2d3a';

  it('accepts every item of a generated summary, with engine ids and timings', () => {
    const summary = engineSummary();
    summary.actions[0]!.id = 'action-12';
    summary.actions[0]!.evidence.timestampSec = 12.3456;
    summary.actions[0]!.alsoAt[0]!.timestampSec = 90.0004;
    summary.decisions[0]!.id = 'decision-13';
    summary.openQuestions[0]!.id = 'openQuestion-14';
    const all = updates(toSummaryDoc(meetingId, stored(summary)));
    expect(all).toHaveLength(8);
    for (const update of all) {
      expect(
        isValidRequest('updateSummaryItem', { meetingId, update }),
        (update as { item: { id: string } }).item.id,
      ).toBe(true);
    }
  });

  it('accepts every item of a summary upgraded from v2', () => {
    const upgraded = SUMMARY_FORMAT.validate(
      SUMMARY_FORMAT.upgrades[2]!({
        schemaVersion: 2,
        meetingId,
        revision: 1,
        transcriptRevision: 1,
        outdated: false,
        brief: { text: 'Brief', edited: false },
        full: null,
        actionItems: [
          {
            id: 'a',
            action: 'Ship',
            owner: 'not specified',
            deadline: 'Unconfirmed',
            status: 'Open',
            sourceMs: 5,
            edited: false,
          },
        ],
        decisions: [
          {
            id: 'd1',
            decision: 'Ship',
            status: 'Decided',
            impactArea: 'Not specified',
            sourceMs: 5,
            edited: false,
          },
          {
            id: 'd2',
            decision: 'Hold',
            status: 'Tentatively agreed',
            impactArea: 'Technical approach',
            sourceMs: 6,
            edited: true,
          },
          {
            id: 'd3',
            decision: 'Wait',
            status: 'Pending',
            impactArea: 'Morale',
            sourceMs: 7,
            edited: false,
          },
        ],
        openQuestions: ['Who owns it?'],
      }),
    );
    const all = updates(toSummaryDoc(meetingId, upgraded));
    expect(all).toHaveLength(6);
    for (const update of all) {
      expect(
        isValidRequest('updateSummaryItem', { meetingId, update }),
        (update as { item: { id: string } }).item.id,
      ).toBe(true);
    }
  });
});

describe('regenerating with the engine numbering', () => {
  it('keeps the edit and every item of the new run when numbers repeat', () => {
    const first = engineSummary();
    first.actions = [{ ...first.actions[0]!, id: 'action-1' }];
    const edited = applySummaryUpdate(stored(first), {
      kind: 'actionItem',
      item: { ...toSummaryDoc('m-1', stored(first)).actionItems[0]!, action: 'My wording' },
    });

    const second = engineSummary();
    second.actions = [
      { ...second.actions[1]!, id: 'action-1', text: 'A new task' },
      {
        ...second.actions[1]!,
        id: 'action-2',
        text: 'Another new task',
        evidence: { lineIndex: 1, timestampSec: 25 },
      },
    ];
    const merged = mergeRegeneratedSummary(edited, stored(second));

    expect(merged.actionItems.map((item) => item.action)).toEqual([
      'My wording',
      'A new task',
      'Another new task',
    ]);
    expect(new Set(merged.actionItems.map((item) => item.id)).size).toBe(3);
    expect(toSummaryDoc('m-1', merged).state).toBe('edited');
  });
});

describe('summary state', () => {
  it('reports each state', () => {
    expect(toSummaryDoc('m-1', null).state).toBe('notGenerated');
    expect(toSummaryDoc('m-1', null, true).state).toBe('generating');
    expect(toSummaryDoc('m-1', stored()).state).toBe('ready');
    expect(toSummaryDoc('m-1', { ...stored(), outdated: true }).state).toBe('outdated');
  });

  it('shows a running job over any stored state', () => {
    expect(toSummaryDoc('m-1', { ...stored(), outdated: true }, true).state).toBe('generating');
  });

  it('shows outdated over edited, so the regenerate prompt is not hidden', () => {
    const file = { ...stored(), outdated: true };
    const edited = applySummaryUpdate(file, {
      kind: 'decision',
      item: toSummaryDoc('m-1', file).decisions[0]!,
    });
    expect(toSummaryDoc('m-1', edited).state).toBe('outdated');
  });
});

describe('applySummaryUpdate', () => {
  const file = stored();
  const doc = toSummaryDoc('m-1', file);

  it.each<[string, SummaryItemUpdate, (next: SummaryFile) => unknown]>([
    [
      'actionItem',
      { kind: 'actionItem', item: { ...doc.actionItems[0]!, action: 'Changed' } },
      (next) => next.actionItems[0],
    ],
    [
      'decision',
      { kind: 'decision', item: { ...doc.decisions[0]!, decision: 'Changed' } },
      (next) => next.decisions[0],
    ],
    [
      'openQuestion',
      { kind: 'openQuestion', item: { ...doc.openQuestions[0]!, question: 'Changed' } },
      (next) => next.openQuestions[0],
    ],
    [
      'narrative',
      { kind: 'narrative', item: { ...doc.narrative.full![0]!, text: 'Changed' } },
      (next) => next.full?.sections[0],
    ],
  ])('applies a %s edit and marks it edited', (_kind, update, read) => {
    const next = applySummaryUpdate(file, update);
    expect(read(next)).toEqual({ ...(update as { item: object }).item, edited: true });
    expect(toSummaryDoc('m-1', next).state).toBe('edited');
  });

  it('edits a brief section when no full summary exists', () => {
    const summary = engineSummary();
    summary.body = { length: 'brief', paragraphs: ['One.', 'Two.'] };
    const brief = stored(summary);
    const item = { ...toSummaryDoc('m-1', brief).narrative.brief![1]!, text: 'Changed' };
    const next = applySummaryUpdate(brief, { kind: 'narrative', item });
    expect(next.brief?.sections.map((section) => section.text)).toEqual(['One.', 'Changed']);
    expect(next.full).toBeNull();
  });

  it.each<SummaryItemUpdate>([
    { kind: 'actionItem', item: { ...doc.actionItems[0]!, id: 'gone' } },
    { kind: 'decision', item: { ...doc.decisions[0]!, id: 'gone' } },
    { kind: 'openQuestion', item: { ...doc.openQuestions[0]!, id: 'gone' } },
  ])('reports a $kind that no longer exists', (update) => {
    expect(() => applySummaryUpdate(file, update)).toThrow(
      expect.objectContaining({ code: 'notFound' }),
    );
  });

  it('reports an item that no longer exists', () => {
    const update: SummaryItemUpdate = {
      kind: 'narrative',
      item: { id: 'gone', heading: null, text: 'x', edited: false },
    };
    expect(() => applySummaryUpdate(file, update)).toThrow(ContractError);
  });
});

describe('link guard', () => {
  // Invented transcript: segments at 0-10 s, 20-30 s and 60-70 s.
  const segments = [
    { startMs: 0, endMs: 10_000 },
    { startMs: 20_000, endMs: 30_000 },
    { startMs: 60_000, endMs: 70_000 },
  ];
  const evidence = { alsoAtMs: [] as number[], needsReview: false, edited: false };
  const action = (id: string, sourceMs: number, alsoAtMs: number[] = []) => ({
    id,
    action: id,
    owner: null,
    ownerUnconfirmed: false,
    deadline: null,
    deadlineUnconfirmed: false,
    status: 'agreed' as const,
    sourceMs,
    ...evidence,
    alsoAtMs,
  });
  const generated = (items: ReturnType<typeof action>[]) => ({
    generatedAt: AT,
    brief: null,
    full: null,
    actionItems: items,
    decisions: [],
    openQuestions: [
      { id: 'q-1', question: 'Why?', sourceMs: null, ...evidence },
      { id: 'q-2', question: 'When?', sourceMs: 65_000, ...evidence },
    ],
    warnings: [],
  });

  it('keeps links inside a segment, including the ends', () => {
    const out = guardSummaryLinks(generated([action('a', 5000), action('b', 30_000)]), segments);
    expect(out.actionItems.map((item) => [item.sourceMs, item.needsReview])).toEqual([
      [5000, false],
      [30_000, false],
    ]);
    expect(out.warnings).toEqual([]);
  });

  it('moves a link in a short gap to the closest segment edge and flags the item', () => {
    // 3 s after the end of the 20-30 s segment: the end, not the start 13 s away.
    const after = guardSummaryLinks(generated([action('a', 33_000)]), segments);
    expect(after.actionItems[0]).toMatchObject({ sourceMs: 30_000, needsReview: true });
    // 2 s before the start of the 60-70 s segment.
    const before = guardSummaryLinks(generated([action('b', 58_000)]), segments);
    expect(before.actionItems[0]).toMatchObject({ sourceMs: 60_000, needsReview: true });
  });

  it('drops an item whose own time is far from any segment, or past the end, and says so', () => {
    const out = guardSummaryLinks(
      generated([action('gap', 45_000), action('late', 90_000), action('ok', 1000)]),
      segments,
    );
    expect(out.actionItems.map((item) => item.id)).toEqual(['ok']);
    expect(out.warnings).toEqual([`2 ${DROPPED_ITEMS_WARNING}.`]);
  });

  it('removes a bad alsoAtMs entry but keeps the item', () => {
    const out = guardSummaryLinks(
      generated([action('a', 5000, [25_000, 90_000, 45_000, 5000])]),
      segments,
    );
    expect(out.actionItems[0]).toMatchObject({ alsoAtMs: [25_000], needsReview: false });
  });

  it('allows an open question with no time and checks the rest', () => {
    const out = guardSummaryLinks(generated([]), segments);
    expect(out.openQuestions.map((item) => item.sourceMs)).toEqual([null, 65_000]);
  });

  it('drops everything with a time when there is no transcript text', () => {
    const out = guardSummaryLinks(generated([action('a', 0)]), []);
    expect(out.actionItems).toEqual([]);
    expect(out.openQuestions.map((item) => item.id)).toEqual(['q-1']);
  });

  it('rejects a user-added or re-timed item outside the transcript', () => {
    const file = stored(engineSummary());
    const item = {
      action: 'New',
      owner: null,
      ownerUnconfirmed: false,
      deadline: null,
      deadlineUnconfirmed: false,
      status: 'proposed' as const,
      sourceMs: 45_000,
    };
    expect(() =>
      applySummaryUpdate(file, { kind: 'add', collection: 'actionItems', item }, segments),
    ).toThrow(expect.objectContaining({ code: 'invalidRequest' }));
    const ok = applySummaryUpdate(
      file,
      { kind: 'add', collection: 'actionItems', item: { ...item, sourceMs: 5000 } },
      segments,
    );
    expect(ok.actionItems.at(-1)?.sourceMs).toBe(5000);
    const existing = file.actionItems[0]!;
    expect(() =>
      applySummaryUpdate(
        file,
        { kind: 'actionItem', item: { ...existing, sourceMs: 45_000 } },
        segments,
      ),
    ).toThrow(expect.objectContaining({ code: 'invalidRequest' }));
    // An unchanged old link is not re-checked.
    expect(() =>
      applySummaryUpdate(file, { kind: 'actionItem', item: existing }, segments),
    ).not.toThrow();
  });
});
