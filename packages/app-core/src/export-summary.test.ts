import { describe, expect, it } from 'vitest';
import {
  SUMMARY_FORMAT,
  emptyTranscript,
  type MeetingMeta,
  type ActionItem,
  type ActionStatus,
  type Decision,
  type DecisionStatus,
  type ImpactArea,
  type SummaryFile,
  type SummarySection,
} from '@scrb/storage';
import { buildExportDocument, type ExportDocument } from '../../export/src/layout.ts';
import { ExportInputError, type ExportMeeting } from '../../export/src/types.ts';
import { toExportMeeting, toExportSummary } from './export-summary.ts';
import { IMPACTS_HEADING, IMPACTS_SECTION_ID, OVERVIEW_SECTION_ID } from './summary.ts';

const EVIDENCE = { alsoAtMs: [], needsReview: false, edited: true };

function action(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    ...EVIDENCE,
    id: 'a-1',
    action: 'Send the estimate',
    owner: 'Priya',
    ownerUnconfirmed: false,
    deadline: 'Friday',
    deadlineUnconfirmed: false,
    status: 'agreed',
    sourceMs: 12_500,
    ...overrides,
  };
}

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    ...EVIDENCE,
    id: 'd-1',
    decision: 'Move the review',
    status: 'decided',
    impactArea: 'schedule',
    sourceMs: 30_000,
    ...overrides,
  };
}

function section(id: string, heading: string | null, text: string): SummarySection {
  return { id, heading, text, edited: false };
}

function file(overrides: Partial<SummaryFile> = {}): SummaryFile {
  return {
    schemaVersion: 3,
    meetingId: 'm-1',
    revision: 1,
    transcriptRevision: 1,
    outdated: false,
    generatedAt: '2026-10-30T12:00:00Z',
    brief: null,
    full: null,
    actionItems: [],
    decisions: [],
    openQuestions: [],
    warnings: [],
    ...overrides,
  };
}

/** Never null here: every caller passes a file. */
function adapted(input: SummaryFile) {
  const summary = toExportSummary(input);
  if (summary === null) throw new Error('expected a summary');
  return summary;
}

function printed(input: SummaryFile | null, length: 'brief' | 'full' = 'full'): ExportDocument {
  const meeting: ExportMeeting = {
    title: 'Sync',
    startedAt: '2026-10-30T12:00:00Z',
    timeZone: 'UTC',
    durationMs: 60_000,
    speakers: [],
    segments: [],
    summary: toExportSummary(input),
  };
  return buildExportDocument(meeting, { scope: 'summary', summary: { length } });
}

function lineText(line: { spans: { text: string }[] }): string {
  return line.spans.map((span) => span.text).join('');
}

function tableRows(document: ExportDocument, index: number): string[][] {
  const table = document.blocks.filter((block) => block.kind === 'table')[index];
  if (table?.kind !== 'table') throw new Error('expected a table');
  return table.rows.map((row) => row.map(lineText));
}

const actionRows = (document: ExportDocument) => tableRows(document, 0);
const decisionRows = (document: ExportDocument) => tableRows(document, 1);

/** Every line of text in the document, tables included. */
function allText(document: ExportDocument): string {
  return document.blocks
    .flatMap((block) => {
      if (block.kind === 'list') return block.items.map(lineText);
      if (block.kind === 'table') return block.rows.flat().map(lineText);
      return [lineText(block.line)];
    })
    .join('\n');
}

describe('corrected transcript export adapter', () => {
  it('sends corrected and original words, timestamp and crash markers to the shared layout', () => {
    const meeting: MeetingMeta = {
      schemaVersion: 1,
      id: 'synthetic',
      title: 'Invented meeting',
      date: '2026-10-31T18:00:00Z',
      createdAt: '2026-10-31T18:00:00Z',
      durationMs: 1000,
      source: 'recorded',
      status: 'recovered',
      audioDeletedAt: null,
      buildVoiceProfiles: false,
    };
    const transcript = emptyTranscript(meeting.id);
    transcript.speakers = [
      {
        id: 'speaker',
        label: 'Speaker 1',
        name: null,
        profileId: null,
        userNamed: false,
        mergedInto: null,
      },
    ];
    transcript.segments = [
      {
        id: 'segment',
        speakerId: 'speaker',
        track: 'meeting',
        pass: 'final',
        words: [{ id: 'word', text: 'invented', startMs: 100, endMs: 300 }],
      },
    ];
    transcript.corrections = [
      {
        id: 'correction',
        wordIds: ['word'],
        replacement: 'Corrected',
        original: {
          text: 'invented',
          startMs: 100,
          endMs: 300,
          speakerId: 'speaker',
          track: 'meeting',
        },
        remember: false,
        state: 'active',
        supersededBy: null,
        createdAt: meeting.createdAt,
        updatedAt: meeting.createdAt,
      },
    ];
    transcript.gaps = [{ id: 'gap', kind: 'paused', startMs: 400, endMs: 600 }];
    const adapted = toExportMeeting(meeting, transcript, null);
    expect(adapted.segments[0]?.parts[0]).toEqual({ text: 'Corrected', original: 'invented' });
    expect(adapted.markers).toMatchObject([
      { kind: 'pause', startMs: 400, endMs: 600 },
      { kind: 'recording-ended', startMs: 1000 },
    ]);
    const doc = buildExportDocument(adapted, {
      scope: 'transcript',
      transcript: { showCorrections: true },
    });
    expect(JSON.stringify(doc.blocks)).toContain('Corrected');
    expect(JSON.stringify(doc.blocks)).toContain('invented');
  });
});

describe('toExportSummary states', () => {
  it('passes "no summary" on, which export reports', () => {
    expect(toExportSummary(null)).toBeNull();
    expect(() => printed(null)).toThrow(ExportInputError);
  });

  it('keeps a length that was not generated null', () => {
    const summary = adapted(file({ brief: { sections: [section('brief-0', null, 'One.')] } }));
    expect(summary.brief).toEqual(['One.']);
    expect(summary.full).toBeNull();

    const other = adapted(file({ full: { sections: [] } }));
    expect(other.brief).toBeNull();
    expect(other.full).not.toBeNull();
  });

  it('reports a missing length through export', () => {
    const only = file({ brief: { sections: [section('brief-0', null, 'One.')] } });
    expect(() => printed(only, 'full')).toThrow(/no full summary/);
  });

  it.each([true, false])('carries outdated = %s', (outdated) => {
    expect(adapted(file({ outdated })).outdated).toBe(outdated);
  });

  it('prints every warning', () => {
    const summary = file({
      warnings: ['Part of the meeting could not be read.'],
      full: { sections: [] },
    });
    expect(allText(printed(summary))).toContain('Part of the meeting could not be read.');
  });

  it('prints the outdated note', () => {
    const summary = file({ outdated: true, full: { sections: [] } });
    expect(allText(printed(summary))).toContain('May be outdated');
  });

  it('prints an empty summary with the empty wording, not blanks', () => {
    const text = allText(printed(file({ full: { sections: [] } })));
    expect(text).toContain('No action items detected.');
    expect(text).toContain('No decisions detected.');
    expect(text).toContain('No open questions.');
  });
});

describe('review provenance in shared export layout', () => {
  it('prints weak evidence and every repeated timestamp in the same layout', () => {
    const summary = file({
      full: { sections: [] },
      actionItems: [action({ needsReview: true, alsoAtMs: [9_000, 15_000] })],
      decisions: [decision({ needsReview: true, alsoAtMs: [40_000] })],
    });
    const text = allText(printed(summary));
    expect(text).toContain('Send the estimate (needs review)');
    expect(text).toContain('Move the review (needs review)');
    expect(text).toContain('0:00:12; 0:00:09; 0:00:15');
    expect(text).toContain('0:00:30; 0:00:40');
  });
});

describe('narrative', () => {
  it('turns each brief line into a paragraph', () => {
    const brief = {
      sections: [section('brief-0', null, 'One.\n\nTwo.'), section('brief-1', null, 'Three.')],
    };
    expect(adapted(file({ brief })).brief).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('keeps a heading a user put on a brief section', () => {
    const brief = { sections: [section('brief-0', 'Note', 'One.')] };
    expect(adapted(file({ brief })).brief).toEqual(['Note', 'One.']);
  });

  it('sorts the full sections by id', () => {
    const full = {
      sections: [
        section(OVERVIEW_SECTION_ID, 'Overview', 'The team met.\nCosts came up.'),
        section('full-topic-0', 'Budget', 'Costs rose.\r\nSavings next.'),
        section(IMPACTS_SECTION_ID, IMPACTS_HEADING, 'Launch slips\nInferred: Costs rise'),
      ],
    };
    expect(adapted(file({ full })).full).toEqual({
      overview: ['The team met.', 'Costs came up.'],
      mainTopics: [{ title: 'Budget', paragraphs: ['Costs rose.', 'Savings next.'] }],
      criticalDecisions: [],
      projectDevelopments: [
        { text: 'Launch slips', sourceMs: null },
        { text: 'Inferred: Costs rise', sourceMs: null },
      ],
    });
  });

  it('finds the impacts section by id after a user renames it', () => {
    const full = { sections: [section(IMPACTS_SECTION_ID, 'Changes', 'Launch slips')] };
    const summary = adapted(file({ full })).full;
    expect(summary?.projectDevelopments).toEqual([{ text: 'Launch slips', sourceMs: null }]);
    expect(summary?.mainTopics).toEqual([]);
  });

  it('keeps an upgraded v2 narrative, which has one section and no heading', () => {
    const full = { sections: [section('full-0', null, 'Everything in one text.')] };
    expect(adapted(file({ full })).full?.overview).toEqual(['Everything in one text.']);
  });

  it('treats a blank heading as no heading', () => {
    const full = { sections: [section('full-topic-0', '  ', 'Kept.')] };
    const summary = adapted(file({ full })).full;
    expect(summary?.overview).toEqual(['Kept.']);
    expect(summary?.mainTopics).toEqual([]);
  });

  it('prints an inferred impact as inferred, each on its own line', () => {
    const full = { sections: [section(IMPACTS_SECTION_ID, null, 'Launch slips\nInferred: Costs')] };
    const lists = printed(file({ full })).blocks.filter((block) => block.kind === 'list');
    const items = lists.flatMap((list) => (list.kind === 'list' ? list.items.map(lineText) : []));
    expect(items).toEqual(['Launch slips', 'Inferred: Costs']);
  });
});

describe('critical decisions', () => {
  it('lists only decided items, as the engine does', () => {
    const decisions = (['decided', 'proposed', 'tentativelyAgreed', 'unresolved'] as const).map(
      (status, index) => decision({ decision: status, status, sourceMs: index }),
    );
    const summary = adapted(file({ full: { sections: [] }, decisions }));
    expect(summary.full?.criticalDecisions).toEqual([{ text: 'decided', sourceMs: 0 }]);
    expect(summary.decisions).toHaveLength(4);
  });
});

describe('open questions', () => {
  it('keeps the text and a source that may be null', () => {
    const openQuestions = [
      { ...EVIDENCE, id: 'q-1', question: 'Who owns it?', sourceMs: 70_000 },
      { ...EVIDENCE, id: 'q-2', question: 'From a v2 file?', sourceMs: null },
    ];
    expect(adapted(file({ openQuestions })).openQuestions).toEqual([
      { text: 'Who owns it?', sourceMs: 70_000 },
      { text: 'From a v2 file?', sourceMs: null },
    ]);
  });
});

describe('action items', () => {
  const body = { full: { sections: [] } };

  it('maps every field', () => {
    expect(adapted(file({ actionItems: [action()] })).actionItems).toEqual([
      {
        action: 'Send the estimate',
        owner: 'Priya',
        ownerUnconfirmed: false,
        deadline: 'Friday',
        deadlineUnconfirmed: false,
        status: 'Agreed',
        sourceMs: 12_500,
      },
    ]);
  });

  it.each<[ActionStatus, string]>([
    ['agreed', 'Agreed'],
    ['proposed', 'Proposed'],
    ['unconfirmed', 'Unconfirmed'],
  ])('prints status %s as %s', (status, words) => {
    const rows = actionRows(printed(file({ ...body, actionItems: [action({ status })] })));
    expect(rows[0]?.[3]).toBe(words);
  });

  it.each<[string, string | null, boolean, string]>([
    ['a named value', 'Priya', false, 'Priya'],
    ['a guessed value', 'Priya', true, 'Priya (unconfirmed)'],
    ['no value', null, false, 'Not specified'],
    ['no value, flagged', null, true, 'Unconfirmed'],
    ['a blank value, flagged', '  ', true, 'Unconfirmed'],
    ['a blank value', '  ', false, 'Not specified'],
  ])('prints %s the same for owner and deadline', (_name, value, unconfirmed, words) => {
    const item = action({
      owner: value,
      ownerUnconfirmed: unconfirmed,
      deadline: value,
      deadlineUnconfirmed: unconfirmed,
    });
    const row = actionRows(printed(file({ ...body, actionItems: [item] })))[0];
    expect(row?.slice(1, 3)).toEqual([words, words]);
  });

  it('keeps owner and deadline flags apart', () => {
    const item = action({ owner: null, ownerUnconfirmed: true, deadline: null });
    const row = actionRows(printed(file({ ...body, actionItems: [item] })))[0];
    expect(row?.slice(1, 3)).toEqual(['Unconfirmed', 'Not specified']);
  });

  it('prints the source timestamp', () => {
    const row = actionRows(printed(file({ ...body, actionItems: [action()] })))[0];
    expect(row?.[4]).toBe('0:00:12');
  });
});

describe('decisions', () => {
  const body = { full: { sections: [] } };

  it('maps every field', () => {
    expect(adapted(file({ decisions: [decision()] })).decisions).toEqual([
      {
        decision: 'Move the review',
        status: 'decided',
        impactArea: 'schedule',
        impactInferred: true,
        sourceMs: 30_000,
      },
    ]);
  });

  it.each<[DecisionStatus, string, string]>([
    ['decided', 'decided', 'Decided'],
    ['proposed', 'proposed', 'Proposed'],
    ['tentativelyAgreed', 'tentatively-agreed', 'Tentatively agreed'],
    ['unresolved', 'unresolved', 'Unresolved'],
  ])('maps status %s', (status, spelled, words) => {
    const decisions = [decision({ status })];
    expect(adapted(file({ decisions })).decisions[0]?.status).toBe(spelled);
    expect(decisionRows(printed(file({ ...body, decisions })))[0]?.[1]).toBe(words);
  });

  it.each<[ImpactArea, string, string]>([
    ['scope', 'scope', 'Scope'],
    ['schedule', 'schedule', 'Schedule'],
    ['cost', 'cost', 'Cost'],
    ['risk', 'risk', 'Risk'],
    ['deliverables', 'deliverables', 'Deliverables'],
    ['technicalApproach', 'technical-approach', 'Technical approach'],
  ])('maps area %s and never prints it as confirmed', (impactArea, spelled, words) => {
    const decisions = [decision({ impactArea })];
    expect(adapted(file({ decisions })).decisions[0]?.impactArea).toBe(spelled);
    expect(decisionRows(printed(file({ ...body, decisions })))[0]?.[2]).toBe(`${words} (inferred)`);
  });

  it('prints no area as not specified, with nothing to flag', () => {
    const decisions = [decision({ impactArea: null })];
    expect(adapted(file({ decisions })).decisions[0]).toMatchObject({
      impactArea: null,
      impactInferred: false,
    });
    expect(decisionRows(printed(file({ ...body, decisions })))[0]?.[2]).toBe('Not specified');
  });

  it('reads a "not specified" area from an upgraded v2 file as no area', () => {
    const upgrade = SUMMARY_FORMAT.upgrades[2];
    if (upgrade === undefined) throw new Error('expected the v2 upgrade');
    const decisions = [{ ...decision(), impactArea: 'not specified' }];
    const upgraded = upgrade({
      brief: null,
      full: null,
      actionItems: [],
      decisions,
      openQuestions: [],
    }) as unknown as SummaryFile;
    expect(adapted(upgraded).decisions[0]).toMatchObject({
      impactArea: null,
      impactInferred: false,
    });
  });
});
