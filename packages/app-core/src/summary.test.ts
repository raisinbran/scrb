import { describe, expect, it } from 'vitest';
import { ContractError, isValidRequest, type SummaryItemUpdate } from '@scrb/contracts';
import type { SummaryFile } from '@scrb/storage';
import type { BaseItem, MeetingSummary } from '../../summary/src/types.ts';
import {
  IMPACTS_HEADING,
  applySummaryUpdate,
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

describe('summary state', () => {
  it('reports each state', () => {
    expect(toSummaryDoc('m-1', null).state).toBe('notGenerated');
    expect(toSummaryDoc('m-1', null, true).state).toBe('generating');
    expect(toSummaryDoc('m-1', stored()).state).toBe('ready');
    expect(toSummaryDoc('m-1', { ...stored(), outdated: true }).state).toBe('outdated');
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
    expect(read(next)).toEqual({ ...update.item, edited: true });
    expect(toSummaryDoc('m-1', next).state).toBe('edited');
  });

  it('reports an item that no longer exists', () => {
    const update: SummaryItemUpdate = {
      kind: 'narrative',
      item: { id: 'gone', heading: null, text: 'x', edited: false },
    };
    expect(() => applySummaryUpdate(file, update)).toThrow(ContractError);
  });
});
