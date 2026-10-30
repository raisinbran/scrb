/** Narrow input and output types for this package; mapped to the shared contract later. */

export interface TranscriptLine {
  startSec: number;
  speaker: string;
  text: string;
}

export interface Transcript {
  lines: TranscriptLine[];
}

export type ItemKind = "action" | "decision" | "impact" | "openQuestion";

export type ItemFlag =
  /** The model's timestamp was wrong; it was moved to the line its quote came from. */
  | "timestamp_repaired"
  /** The timestamp exists but that part of the transcript barely supports the item. */
  | "weak_evidence"
  | "owner_unconfirmed"
  | "deadline_unconfirmed"
  /** Another decision on the same subject says the opposite. */
  | "conflict";

export interface EvidenceLink {
  lineIndex: number;
  timestampSec: number;
}

export interface BaseItem {
  id: string;
  text: string;
  evidence: EvidenceLink;
  /** Where a merged duplicate was also raised. */
  alsoAt: EvidenceLink[];
  flags: ItemFlag[];
  pass: string;
}

export type ActionStatus = "Agreed" | "Proposed" | "Unconfirmed";
export type DecisionStatus = "Decided" | "Proposed" | "Tentatively agreed" | "Unresolved";
export type ImpactArea =
  | "Scope"
  | "Schedule"
  | "Cost"
  | "Risk"
  | "Deliverables"
  | "Technical approach"
  | "Not specified";
export type ImpactBasis = "Stated" | "Inferred";

export const NOT_SPECIFIED = "Not specified";
export const UNCONFIRMED = "Unconfirmed";

export interface ActionItem extends BaseItem {
  kind: "action";
  owner: string;
  deadline: string;
  status: ActionStatus;
}

export interface DecisionItem extends BaseItem {
  kind: "decision";
  status: DecisionStatus;
  impactArea: ImpactArea;
}

export interface ImpactItem extends BaseItem {
  kind: "impact";
  impactArea: ImpactArea;
  /** "Inferred" impacts are never shown as confirmed. */
  basis: ImpactBasis;
}

export interface OpenQuestionItem extends BaseItem {
  kind: "openQuestion";
}

export type SummaryItem = ActionItem | DecisionItem | ImpactItem | OpenQuestionItem;

export interface RejectedItem {
  kind: ItemKind;
  text: string;
  timestamp: string;
  pass: string;
  reason: string;
}

export interface ExtractionStats {
  sections: number;
  requests: number;
  retries: number;
  splits: number;
  promptTokens: number;
  completionTokens: number;
}

export interface Extraction {
  sourceHash: string;
  actions: ActionItem[];
  decisions: DecisionItem[];
  impacts: ImpactItem[];
  openQuestions: OpenQuestionItem[];
  /** One line per section, in meeting order, for the narrative. */
  gists: string[];
  rejected: RejectedItem[];
  /** Parts of the meeting that could not be read; never hidden from the user. */
  warnings: string[];
  stats: ExtractionStats;
}

export type SummaryLength = "brief" | "full";

export interface BriefBody {
  length: "brief";
  paragraphs: string[];
}

export interface FullBody {
  length: "full";
  overview: string;
  mainTopics: { title: string; summary: string }[];
}

export interface MeetingSummary {
  schemaVersion: 1;
  sourceHash: string;
  model: string;
  body: BriefBody | FullBody;
  actions: ActionItem[];
  decisions: DecisionItem[];
  impacts: ImpactItem[];
  openQuestions: OpenQuestionItem[];
  warnings: string[];
}
