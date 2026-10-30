import { cleanInline, formatDuration, formatTimestamp, isRtl } from './text.js';
import { ExportInputError } from './types.js';
import type {
  DecisionStatus,
  ExportActionItem,
  ExportDecision,
  ExportMarker,
  ExportMeeting,
  ExportRequest,
  ExportSegment,
  ExportSourcedItem,
  ExportSummary,
  ImpactArea,
  SummaryOptions,
  TranscriptOptions,
} from './types.js';

/**
 * The shared layout. Every word of an export is decided here; the DOCX and
 * HTML renderers only map these blocks to their format, which is what keeps
 * the two formats holding the same information.
 */
export interface ExportDocument {
  /** Null when the title option is off, so it stays out of file metadata too. */
  title: string | null;
  locale: string;
  blocks: Block[];
}

export type Block = TitleBlock | HeadingBlock | ParagraphBlock | ListBlock | TableBlock;

export interface TitleBlock {
  kind: 'title';
  line: Line;
}

export interface HeadingBlock {
  kind: 'heading';
  level: 1 | 2 | 3;
  line: Line;
  /** Starts a new page: the second section of a Both export. */
  newPage?: boolean;
}

export type ParagraphRole = 'body' | 'meta' | 'note' | 'marker' | 'speaker' | 'utterance';

export interface ParagraphBlock {
  kind: 'paragraph';
  role: ParagraphRole;
  line: Line;
}

export interface ListBlock {
  kind: 'list';
  items: Line[];
}

export interface TableBlock {
  kind: 'table';
  columns: TableColumn[];
  rows: Line[][];
}

export interface TableColumn {
  header: Line;
  /** Relative width; renderers scale the weights to the page. */
  weight: number;
}

/** One run of text in one direction, the unit both renderers work from. */
export interface Line {
  spans: Span[];
  rtl?: boolean;
}

export type SpanStyle = 'plain' | 'strong' | 'muted' | 'corrected' | 'original';

export interface Span {
  text: string;
  style: SpanStyle;
  rtl?: boolean;
}

const LABELS = {
  summary: { brief: 'Brief summary', full: 'Full summary' },
  transcript: 'Transcript',
  date: 'Date',
  duration: 'Duration',
  overview: 'Overview',
  mainTopics: 'Main topics',
  criticalDecisions: 'Critical decisions',
  projectDevelopments: 'Project-impacting developments',
  openQuestions: 'Open questions',
  actionItems: 'Action items',
  decisions: 'Decisions',
  notSpecified: 'Not specified',
  unconfirmed: 'Unconfirmed',
  unknownSpeaker: 'Unknown speaker',
  inferred: 'inferred',
  noneRecorded: 'None recorded.',
  noSummaryText: 'No summary text.',
  noOpenQuestions: 'No open questions.',
  noActionItems: 'No action items detected.',
  noDecisions: 'No decisions detected.',
  noTranscript: 'No transcript text.',
  outdated: 'May be outdated: the transcript changed after this summary was generated.',
  provisional: 'Provisional: this transcript has not had its final pass.',
  correctionsLegend: 'Corrected text is underlined. The original words follow, struck through.',
} as const;

const DECISION_STATUS: Record<DecisionStatus, string> = {
  decided: 'Decided',
  proposed: 'Proposed',
  'tentatively-agreed': 'Tentatively agreed',
  unresolved: 'Unresolved',
};

const IMPACT_AREA: Record<ImpactArea, string> = {
  scope: 'Scope',
  schedule: 'Schedule',
  cost: 'Cost',
  risk: 'Risk',
  deliverables: 'Deliverables',
  'technical-approach': 'Technical approach',
};

const DEFAULT_TRANSCRIPT: TranscriptOptions = {
  title: true,
  date: true,
  duration: true,
  speakerNames: true,
  timestamps: true,
  showCorrections: false,
};

const DEFAULT_SUMMARY: SummaryOptions = {
  length: 'full',
  openQuestions: true,
  sourceTimestamps: true,
};

export function buildExportDocument(meeting: ExportMeeting, request: ExportRequest): ExportDocument {
  const transcript = { ...DEFAULT_TRANSCRIPT, ...request.transcript };
  const summary = { ...DEFAULT_SUMMARY, ...request.summary };
  const locale = request.locale ?? 'en-US';

  const blocks: Block[] = buildHeader(meeting, transcript, locale);
  if (request.scope !== 'transcript') {
    blocks.push(...buildSummary(requireSummary(meeting, summary), summary));
  }
  if (request.scope !== 'summary') {
    blocks.push(...buildTranscript(meeting, transcript, request.scope === 'both'));
  }

  const title = transcript.title ? cleanInline(meeting.title).trim() : null;
  return { title, locale, blocks };
}

function requireSummary(meeting: ExportMeeting, options: SummaryOptions): ExportSummary {
  const { summary } = meeting;
  if (summary === undefined || summary === null) {
    throw new ExportInputError('no-summary', 'This meeting has no summary to export.');
  }
  if (summary[options.length] === null) {
    throw new ExportInputError(
      'summary-length-missing',
      `This meeting has no ${options.length} summary. Generate it before exporting.`,
    );
  }
  return summary;
}

function buildHeader(
  meeting: ExportMeeting,
  options: TranscriptOptions,
  locale: string,
): Block[] {
  const blocks: Block[] = [];
  if (options.title) blocks.push({ kind: 'title', line: textLine(meeting.title) });
  if (options.date) blocks.push(meta(LABELS.date, formatDate(meeting, locale)));
  if (options.duration) blocks.push(meta(LABELS.duration, formatDuration(meeting.durationMs)));
  return blocks;
}

function meta(label: string, value: string): ParagraphBlock {
  return paragraph('meta', {
    spans: [span(label, 'strong'), span(': ', 'plain'), span(value, 'plain')],
  });
}

function formatDate(meeting: ExportMeeting, locale: string): string {
  const date = new Date(meeting.startedAt);
  if (Number.isNaN(date.getTime())) {
    throw new ExportInputError('invalid-date', `Unreadable meeting date: ${meeting.startedAt}`);
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    ...(meeting.timeZone === undefined ? {} : { timeZone: meeting.timeZone }),
  }).format(date);
}

function buildSummary(summary: ExportSummary, options: SummaryOptions): Block[] {
  const blocks: Block[] = [heading(1, LABELS.summary[options.length])];
  if (summary.outdated) blocks.push(paragraph('note', textLine(LABELS.outdated)));

  blocks.push(...(options.length === 'brief' ? buildBriefBody(summary) : buildFullBody(summary, options)));

  if (options.openQuestions) {
    blocks.push(heading(2, LABELS.openQuestions));
    blocks.push(...sourcedList(summary.openQuestions, options, LABELS.noOpenQuestions));
  }

  blocks.push(heading(2, LABELS.actionItems), actionTable(summary.actionItems, options));
  blocks.push(heading(2, LABELS.decisions), decisionTable(summary.decisions, options));
  return blocks;
}

function buildBriefBody(summary: ExportSummary): Block[] {
  return paragraphsOr(summary.brief ?? [], LABELS.noSummaryText);
}

function buildFullBody(summary: ExportSummary, options: SummaryOptions): Block[] {
  const full = summary.full;
  if (full === null) return [];

  const blocks: Block[] = [heading(2, LABELS.overview), ...paragraphsOr(full.overview, LABELS.noneRecorded)];

  blocks.push(heading(2, LABELS.mainTopics));
  if (full.mainTopics.length === 0) blocks.push(paragraph('note', textLine(LABELS.noneRecorded)));
  for (const topic of full.mainTopics) {
    blocks.push(heading(3, topic.title), ...paragraphsOr(topic.paragraphs, LABELS.noneRecorded));
  }

  blocks.push(heading(2, LABELS.criticalDecisions));
  blocks.push(...sourcedList(full.criticalDecisions, options, LABELS.noneRecorded));
  blocks.push(heading(2, LABELS.projectDevelopments));
  blocks.push(...sourcedList(full.projectDevelopments, options, LABELS.noneRecorded));
  return blocks;
}

function paragraphsOr(paragraphs: readonly string[], empty: string): Block[] {
  const lines = paragraphs.map(textLine).filter(hasText);
  if (lines.length === 0) return [paragraph('note', textLine(empty))];
  return lines.map((line) => paragraph('body', line));
}

function sourcedList(
  items: readonly ExportSourcedItem[],
  options: SummaryOptions,
  empty: string,
): Block[] {
  const lines = items.map((item) => sourcedLine(item, options)).filter(hasText);
  return lines.length === 0 ? [paragraph('note', textLine(empty))] : [{ kind: 'list', items: lines }];
}

function sourcedLine(item: ExportSourcedItem, options: SummaryOptions): Line {
  const line = textLine(item.text);
  if (options.sourceTimestamps && item.sourceMs !== null && hasText(line)) {
    line.spans.push(span(` (${formatTimestamp(item.sourceMs)})`, 'muted'));
  }
  return line;
}

function actionTable(items: readonly ExportActionItem[], options: SummaryOptions): TableBlock {
  const columns = [column('Action', 34), column('Owner', 18), column('Deadline', 16), column('Status', 14)];
  if (items.length === 0) return emptyTable(columns, LABELS.noActionItems, options);

  const rows = items.map((item) => {
    const row = [
      textLine(item.action),
      flagged(item.owner, item.ownerUnconfirmed),
      flagged(item.deadline, item.deadlineUnconfirmed),
      textLine(item.status ?? LABELS.unconfirmed),
    ];
    return withSource(row, item.sourceMs, options);
  });
  return { kind: 'table', columns: withSourceColumn(columns, options), rows };
}

function decisionTable(items: readonly ExportDecision[], options: SummaryOptions): TableBlock {
  const columns = [column('Decision', 44), column('Status', 19), column('Impact area', 19)];
  if (items.length === 0) return emptyTable(columns, LABELS.noDecisions, options);

  const rows = items.map((item) => {
    const row = [
      textLine(item.decision),
      textLine(DECISION_STATUS[item.status]),
      textLine(impactText(item)),
    ];
    return withSource(row, item.sourceMs, options);
  });
  return { kind: 'table', columns: withSourceColumn(columns, options), rows };
}

function impactText(item: ExportDecision): string {
  if (item.impactArea === null) return LABELS.notSpecified;
  const area = IMPACT_AREA[item.impactArea];
  return item.impactInferred ? `${area} (${LABELS.inferred})` : area;
}

function flagged(value: string | null, unconfirmed: boolean | undefined): Line {
  const text = value === null ? '' : cleanInline(value).trim();
  if (text === '') return textLine(LABELS.notSpecified);
  return textLine(unconfirmed ? `${text} (${LABELS.unconfirmed.toLowerCase()})` : text);
}

function emptyTable(columns: TableColumn[], message: string, options: SummaryOptions): TableBlock {
  const all = withSourceColumn(columns, options);
  const row = all.map((_, index) => (index === 0 ? textLine(message) : { spans: [] }));
  return { kind: 'table', columns: all, rows: [row] };
}

function withSourceColumn(columns: TableColumn[], options: SummaryOptions): TableColumn[] {
  return options.sourceTimestamps ? [...columns, column('Source', 18)] : columns;
}

function withSource(row: Line[], sourceMs: number | null, options: SummaryOptions): Line[] {
  if (!options.sourceTimestamps) return row;
  return [...row, textLine(sourceMs === null ? LABELS.notSpecified : formatTimestamp(sourceMs))];
}

function column(header: string, weight: number): TableColumn {
  return { header: textLine(header), weight };
}

function buildTranscript(
  meeting: ExportMeeting,
  options: TranscriptOptions,
  newPage: boolean,
): Block[] {
  const title = heading(1, LABELS.transcript);
  if (newPage) title.newPage = true;
  const blocks: Block[] = [title];

  if (meeting.transcriptProvisional) blocks.push(paragraph('note', textLine(LABELS.provisional)));
  if (options.showCorrections && meeting.segments.some(hasCorrection)) {
    blocks.push(paragraph('note', textLine(LABELS.correctionsLegend)));
  }

  const names = new Map(meeting.speakers.map((speaker) => [speaker.id, speaker.name]));
  let lastSpeaker: string | null | undefined;
  let spoken = 0;
  for (const entry of timeline(meeting)) {
    if ('kind' in entry) {
      blocks.push(paragraph('marker', textLine(markerText(entry, options))));
      lastSpeaker = undefined;
      continue;
    }
    const spans = segmentSpans(entry, options);
    if (spans.length === 0) continue;
    spoken += 1;
    if (options.speakerNames && entry.speakerId !== lastSpeaker) {
      blocks.push(paragraph('speaker', speakerLine(names, entry.speakerId)));
      lastSpeaker = entry.speakerId;
    }
    blocks.push(paragraph('utterance', utteranceLine(entry, spans, options)));
  }

  if (spoken === 0) blocks.push(paragraph('note', textLine(LABELS.noTranscript)));
  return blocks;
}

function timeline(meeting: ExportMeeting): (ExportSegment | ExportMarker)[] {
  const entries = [...meeting.segments, ...(meeting.markers ?? [])];
  return entries.sort((a, b) => a.startMs - b.startMs);
}

function hasCorrection(segment: ExportSegment): boolean {
  return segment.parts.some((part) => part.original !== undefined);
}

function markerText(marker: ExportMarker, options: TranscriptOptions): string {
  const at = formatTimestamp(marker.startMs);
  if (marker.kind === 'recording-ended') {
    return options.timestamps
      ? `Recording ended unexpectedly at ${at}.`
      : 'Recording ended unexpectedly.';
  }
  const label = marker.kind === 'pause' ? 'Paused' : 'Gap in the audio';
  const endMs = marker.endMs ?? marker.startMs;
  const length = formatDuration(endMs - marker.startMs);
  return options.timestamps
    ? `${label} from ${at} to ${formatTimestamp(endMs)} (${length}).`
    : `${label} (${length}).`;
}

function speakerLine(names: ReadonlyMap<string, string>, speakerId: string | null): Line {
  const name = cleanInline(names.get(speakerId ?? '') ?? '').trim();
  const text = name === '' ? LABELS.unknownSpeaker : name;
  return { spans: [span(text, 'strong')], ...directionOf(text) };
}

function segmentSpans(segment: ExportSegment, options: TranscriptOptions): Span[] {
  const spans: Span[] = [];
  for (const part of segment.parts) {
    const text = cleanInline(part.text);
    if (options.showCorrections && part.original !== undefined) {
      pushSpan(spans, text, 'corrected');
      const original = cleanInline(part.original).trim();
      if (original !== '') {
        pushSpan(spans, ' ', 'plain');
        pushSpan(spans, original, 'original');
      }
    } else {
      pushSpan(spans, text, 'plain');
    }
  }
  return trimSpans(spans);
}

function pushSpan(spans: Span[], text: string, style: Span['style']): void {
  if (text === '') return;
  const last = spans.at(-1);
  if (last?.style === style) last.text += text;
  else spans.push({ text, style });
}

function trimSpans(spans: Span[]): Span[] {
  const first = spans[0];
  if (first !== undefined) first.text = first.text.trimStart();
  const last = spans.at(-1);
  if (last !== undefined) last.text = last.text.trimEnd();
  return spans.filter((item) => item.text !== '');
}

function utteranceLine(
  segment: ExportSegment,
  spans: Span[],
  options: TranscriptOptions,
): Line {
  const content = spans.map((item) => (isRtl(item.text) ? { ...item, rtl: true } : item));
  const direction = directionOf(spans.map((item) => item.text).join(''));
  if (!options.timestamps) return { spans: content, ...direction };
  const stamp = span(formatTimestamp(segment.startMs), 'muted');
  return { spans: [stamp, span(' ', 'plain'), ...content], ...direction };
}

function heading(level: HeadingBlock['level'], text: string): HeadingBlock {
  return { kind: 'heading', level, line: textLine(text) };
}

function paragraph(role: ParagraphRole, line: Line): ParagraphBlock {
  return { kind: 'paragraph', role, line };
}

function span(text: string, style: Span['style']): Span {
  return { text, style };
}

function textLine(text: string): Line {
  const clean = cleanInline(text).trim();
  if (clean === '') return { spans: [] };
  const direction = directionOf(clean);
  return { spans: [{ text: clean, style: 'plain', ...direction }], ...direction };
}

function directionOf(text: string): { rtl?: true } {
  return isRtl(text) ? { rtl: true } : {};
}

function hasText(line: Line): boolean {
  return line.spans.length > 0;
}
