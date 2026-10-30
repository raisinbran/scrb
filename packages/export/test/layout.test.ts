import { describe, expect, it } from 'vitest';
import { buildExportDocument, ExportInputError } from '../src/index.js';
import type { Block, ExportDocument, ExportMeeting, TableBlock } from '../src/index.js';
import { formatDuration, formatTimestamp } from '../src/text.js';
import { emptyMeeting, standardMeeting } from './fixtures.js';

function lineText(line: { spans: { text: string }[] }): string {
  return line.spans.map((span) => span.text).join('');
}

function blockTexts(block: Block): string[] {
  if (block.kind === 'list') return block.items.map(lineText);
  if (block.kind === 'table') {
    return [...block.columns.map((c) => lineText(c.header)), ...block.rows.flat().map(lineText)];
  }
  return [lineText(block.line)];
}

function texts(document: ExportDocument): string[] {
  return document.blocks.flatMap(blockTexts);
}

function tables(document: ExportDocument): TableBlock[] {
  return document.blocks.filter((block): block is TableBlock => block.kind === 'table');
}

function headers(table: TableBlock | undefined): string[] {
  return table?.columns.map((column) => lineText(column.header)) ?? [];
}

describe('transcript options', () => {
  it('shows title, date and duration by default, in the meeting time zone', () => {
    const all = texts(buildExportDocument(standardMeeting, { scope: 'transcript' }));
    expect(all[0]).toBe('Harbor launch planning');
    expect(all[1]).toMatch(/^Date: October 28, 2026 at 10:00/);
    expect(all[2]).toBe('Duration: 47 min');
  });

  it('drops each header line on its own', () => {
    const document = buildExportDocument(standardMeeting, {
      scope: 'transcript',
      transcript: { title: false, date: false, duration: false },
    });
    expect(document.title).toBeNull();
    expect(document.blocks[0]?.kind).toBe('heading');
  });

  it('labels each change of speaker once, and unknown speakers plainly', () => {
    const all = texts(buildExportDocument(standardMeeting, { scope: 'transcript' }));
    expect(all.filter((text) => text === 'You')).toHaveLength(1);
    expect(all.filter((text) => text === 'Unknown speaker')).toHaveLength(2);
  });

  it('removes speaker names and timestamps when off', () => {
    const all = texts(
      buildExportDocument(standardMeeting, {
        scope: 'transcript',
        transcript: { speakerNames: false, timestamps: false },
      }),
    );
    expect(all).not.toContain('You');
    expect(all).toContain('Thanks for joining, everyone.');
    expect(all).toContain('Paused (2 min).');
    expect(all).toContain('Recording ended unexpectedly.');
  });

  it('prints the corrected text only, unless corrections are shown', () => {
    const hidden = texts(buildExportDocument(standardMeeting, { scope: 'transcript' }));
    expect(hidden).toContain('0:00:09 The Harbor launch is first on the list.');
    expect(hidden.join()).not.toContain('harbour');

    const shown = buildExportDocument(standardMeeting, {
      scope: 'transcript',
      transcript: { showCorrections: true },
    });
    const spans = shown.blocks.flatMap((block) =>
      block.kind === 'paragraph' ? block.line.spans : [],
    );
    expect(spans).toContainEqual({ text: 'Harbor', style: 'corrected' });
    expect(spans).toContainEqual({ text: 'harbour', style: 'original' });
    expect(texts(shown).join()).toContain('Corrected text is underlined');
  });

  it('keeps pauses, gaps and crash ends in time order', () => {
    const all = texts(buildExportDocument(standardMeeting, { scope: 'transcript' }));
    const pause = all.indexOf('Paused from 0:05:00 to 0:07:00 (2 min).');
    const gap = all.indexOf('Gap in the audio from 0:25:00 to 0:25:12 (12 sec).');
    expect(pause).toBeGreaterThan(all.indexOf('0:00:15 Billing < vendor & "timing" is my worry.'));
    expect(pause).toBeLessThan(all.indexOf('0:21:00 Can you hear me now?'));
    expect(gap).toBeGreaterThan(all.indexOf('0:22:00 Yes, go ahead.'));
    expect(all.at(-1)).toBe('Recording ended unexpectedly at 0:47:00.');
  });

  it('flags a provisional transcript', () => {
    const meeting: ExportMeeting = { ...standardMeeting, transcriptProvisional: true };
    expect(texts(buildExportDocument(meeting, { scope: 'transcript' })).join()).toContain(
      'has not had its final pass',
    );
  });
});

describe('summary options', () => {
  it('prints Brief as paragraphs and Full as its five parts', () => {
    const brief = texts(
      buildExportDocument(standardMeeting, { scope: 'summary', summary: { length: 'brief' } }),
    );
    expect(brief).toContain('Brief summary');
    expect(brief).not.toContain('Overview');

    const full = texts(
      buildExportDocument(standardMeeting, { scope: 'summary', summary: { length: 'full' } }),
    );
    for (const heading of [
      'Full summary',
      'Overview',
      'Main topics',
      'Critical decisions',
      'Project-impacting developments',
      'Open questions',
    ]) {
      expect(full).toContain(heading);
    }
  });

  it('always includes both tables, even with every option off', () => {
    const document = buildExportDocument(standardMeeting, {
      scope: 'summary',
      summary: { length: 'brief', openQuestions: false, sourceTimestamps: false },
    });
    const [actions, decisions] = tables(document);
    expect(headers(actions)).toEqual(['Action', 'Owner', 'Deadline', 'Status']);
    expect(headers(decisions)).toEqual(['Decision', 'Status', 'Impact area']);
    expect(texts(document)).not.toContain('Open questions');
  });

  it('adds a source column and source times when on', () => {
    const document = buildExportDocument(standardMeeting, { scope: 'summary' });
    const [actions, decisions] = tables(document);
    expect(headers(actions).at(-1)).toBe('Source');
    expect(headers(decisions).at(-1)).toBe('Source');
    expect(texts(document)).toContain('Who signs the revised vendor order? (0:31:05)');
    expect(texts(document)).toContain('Does the launch need a second review?');
  });

  it('flags unknown and unconfirmed details and never invents them', () => {
    const all = texts(buildExportDocument(standardMeeting, { scope: 'summary' }));
    expect(all).toContain('Tomasz (unconfirmed)');
    expect(all).toContain('End of month (unconfirmed)');
    expect(all).toContain('Not specified');
    expect(all).toContain('Unconfirmed');
    expect(all).toContain('Cost (inferred)');
    expect(all).toContain('Tentatively agreed');
    expect(all).toContain('Technical approach');
  });

  it('notes an outdated summary', () => {
    const meeting: ExportMeeting = {
      ...standardMeeting,
      summary: { ...standardMeeting.summary!, outdated: true },
    };
    expect(texts(buildExportDocument(meeting, { scope: 'summary' })).join()).toContain(
      'May be outdated',
    );
  });
});

describe('Both', () => {
  it('puts the summary first and starts the transcript on a new page', () => {
    const document = buildExportDocument(standardMeeting, { scope: 'both' });
    const sections = document.blocks.filter(
      (block) => block.kind === 'heading' && block.level === 1,
    );
    expect(sections.map((block) => blockTexts(block)[0])).toEqual(['Full summary', 'Transcript']);
    expect(sections[1]).toMatchObject({ newPage: true });
  });
});

describe('empty sections', () => {
  it('says so instead of leaving a blank', () => {
    const all = texts(buildExportDocument(emptyMeeting, { scope: 'both' }));
    for (const text of [
      'None recorded.',
      'No open questions.',
      'No action items detected.',
      'No decisions detected.',
      'No transcript text.',
    ]) {
      expect(all).toContain(text);
    }
  });

  it('keeps table shape when a table is empty', () => {
    const [actions] = tables(buildExportDocument(emptyMeeting, { scope: 'summary' }));
    expect(actions?.rows).toHaveLength(1);
    expect(actions?.rows[0]).toHaveLength(actions?.columns.length ?? 0);
  });
});

describe('input errors', () => {
  it('refuses a summary export with no summary', () => {
    const meeting: ExportMeeting = { ...standardMeeting, summary: null };
    for (const scope of ['summary', 'both'] as const) {
      expect(() => buildExportDocument(meeting, { scope })).toThrow(ExportInputError);
    }
    expect(() => buildExportDocument(meeting, { scope: 'transcript' })).not.toThrow();
  });

  it('never swaps in the other length', () => {
    const meeting: ExportMeeting = {
      ...standardMeeting,
      summary: { ...standardMeeting.summary!, full: null },
    };
    expect(() =>
      buildExportDocument(meeting, { scope: 'summary', summary: { length: 'full' } }),
    ).toThrow(expect.objectContaining({ code: 'summary-length-missing' }));
  });

  it('refuses an unreadable date', () => {
    const meeting: ExportMeeting = { ...standardMeeting, startedAt: 'not a date' };
    expect(() => buildExportDocument(meeting, { scope: 'transcript' })).toThrow(
      expect.objectContaining({ code: 'invalid-date' }),
    );
  });
});

describe('formatting', () => {
  it('prints timestamps past ten hours', () => {
    expect(formatTimestamp(0)).toBe('0:00:00');
    expect(formatTimestamp(61_999)).toBe('0:01:01');
    expect(formatTimestamp(36_000_000)).toBe('10:00:00');
  });

  it('prints durations in plain words', () => {
    expect(formatDuration(40_000)).toBe('40 sec');
    expect(formatDuration(47 * 60_000)).toBe('47 min');
    expect(formatDuration(3_600_000)).toBe('1 h');
    expect(formatDuration(8 * 3_600_000 + 5 * 60_000)).toBe('8 h 5 min');
    expect(formatDuration(3_599_900)).toBe('1 h');
  });
});
