/**
 * Narrow input types for this package. They are mapped from the shared
 * meeting contract by the caller, so nothing here depends on transcript.json
 * or summary.json directly.
 */

export interface ExportMeeting {
  title: string;
  /** ISO 8601 instant of the meeting start (or the file date for imports). */
  startedAt: string;
  /** IANA zone used to print the date. Defaults to the system zone. */
  timeZone?: string;
  durationMs: number;
  speakers: readonly ExportSpeaker[];
  segments: readonly ExportSegment[];
  /** Pauses, gaps and crash ends. Requirements say these stay visible. */
  markers?: readonly ExportMarker[];
  /** True while the final pass has not replaced the live text. */
  transcriptProvisional?: boolean;
  summary?: ExportSummary | null;
}

export interface ExportSpeaker {
  id: string;
  name: string;
}

export interface ExportSegment {
  /** Null, or an id not in `speakers`, prints as "Unknown speaker". */
  speakerId: string | null;
  startMs: number;
  /** Concatenated verbatim, so parts carry their own spaces. */
  parts: readonly ExportTextPart[];
}

export interface ExportTextPart {
  text: string;
  /** Present when the user corrected this text; the words as first heard. */
  original?: string;
}

export interface ExportMarker {
  kind: 'pause' | 'gap' | 'recording-ended';
  startMs: number;
  /** Absent for `recording-ended`. */
  endMs?: number;
}

export interface ExportSummary {
  /** Null when that length has not been generated. */
  brief: readonly string[] | null;
  full: ExportFullSummary | null;
  openQuestions: readonly ExportSourcedItem[];
  actionItems: readonly ExportActionItem[];
  decisions: readonly ExportDecision[];
  /** Transcript changed after generation ("May be outdated"). */
  outdated?: boolean;
}

export interface ExportFullSummary {
  overview: readonly string[];
  mainTopics: readonly ExportTopic[];
  criticalDecisions: readonly ExportSourcedItem[];
  projectDevelopments: readonly ExportSourcedItem[];
}

export interface ExportTopic {
  title: string;
  paragraphs: readonly string[];
}

export interface ExportSourcedItem {
  text: string;
  sourceMs: number | null;
}

export interface ExportActionItem {
  action: string;
  /** Null prints "Not specified". */
  owner: string | null;
  /** The owner is a guess, so it must be flagged rather than stated. */
  ownerUnconfirmed?: boolean;
  deadline: string | null;
  deadlineUnconfirmed?: boolean;
  /** Null prints "Unconfirmed". */
  status: string | null;
  sourceMs: number | null;
}

export type DecisionStatus = 'decided' | 'proposed' | 'tentatively-agreed' | 'unresolved';

export type ImpactArea =
  | 'scope'
  | 'schedule'
  | 'cost'
  | 'risk'
  | 'deliverables'
  | 'technical-approach';

export interface ExportDecision {
  decision: string;
  status: DecisionStatus;
  impactArea: ImpactArea | null;
  /** The impact was inferred, so it must never read as confirmed. */
  impactInferred?: boolean;
  sourceMs: number | null;
}

export type ExportScope = 'transcript' | 'summary' | 'both';

export interface TranscriptOptions {
  title: boolean;
  date: boolean;
  duration: boolean;
  speakerNames: boolean;
  timestamps: boolean;
  showCorrections: boolean;
}

export interface SummaryOptions {
  length: 'brief' | 'full';
  openQuestions: boolean;
  sourceTimestamps: boolean;
}

export interface ExportRequest {
  scope: ExportScope;
  /** Title, date and duration also head a summary-only export. */
  transcript?: Partial<TranscriptOptions>;
  summary?: Partial<SummaryOptions>;
  /** BCP 47 tag for dates and the HTML `lang`. Defaults to en-US. */
  locale?: string;
}

export type ExportErrorCode = 'no-summary' | 'summary-length-missing' | 'invalid-date';

/** Bad input that the export dialog should have prevented or must explain. */
export class ExportInputError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = 'ExportInputError';
    this.code = code;
  }
}
