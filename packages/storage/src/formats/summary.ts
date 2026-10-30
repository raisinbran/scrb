import { assertFormat, type FileFormat, type JsonObject } from './versioned.ts';

export type ActionStatus = 'agreed' | 'proposed' | 'unconfirmed';
export type DecisionStatus = 'decided' | 'proposed' | 'tentativelyAgreed' | 'unresolved';
export type ImpactArea =
  | 'scope'
  | 'schedule'
  | 'cost'
  | 'risk'
  | 'deliverables'
  | 'technicalApproach';

/** Provenance every summary item keeps. */
export interface ItemEvidence {
  /** Where else a merged duplicate was raised. */
  alsoAtMs: number[];
  /** The transcript barely supports this item, or another item contradicts it. */
  needsReview: boolean;
  edited: boolean;
}

export interface ActionItem extends ItemEvidence {
  id: string;
  action: string;
  /** Null reads "Not specified", or "Unconfirmed" when its flag is set. */
  owner: string | null;
  ownerUnconfirmed: boolean;
  deadline: string | null;
  deadlineUnconfirmed: boolean;
  status: ActionStatus;
  sourceMs: number;
}

export interface Decision extends ItemEvidence {
  id: string;
  decision: string;
  status: DecisionStatus;
  impactArea: ImpactArea | null;
  sourceMs: number;
}

export interface OpenQuestion extends ItemEvidence {
  id: string;
  question: string;
  sourceMs: number | null;
}

export interface SummarySection {
  id: string;
  heading: string | null;
  text: string;
  edited: boolean;
}

export interface SummaryBody {
  sections: SummarySection[];
}

/** `summary.json`: one or both lengths, always with the full tables. */
export interface SummaryFile {
  schemaVersion: 3;
  meetingId: string;
  revision: number;
  /** The transcript revision this was generated from. */
  transcriptRevision: number;
  /** "May be outdated": set by any transcript or speaker edit after generating. */
  outdated: boolean;
  generatedAt: string | null;
  brief: SummaryBody | null;
  full: SummaryBody | null;
  actionItems: ActionItem[];
  decisions: Decision[];
  openQuestions: OpenQuestion[];
  /** Parts of the meeting the summary could not read. */
  warnings: string[];
}

function validateSummary(doc: JsonObject): SummaryFile {
  assertFormat(typeof doc['meetingId'] === 'string', 'meetingId');
  assertFormat(Number.isInteger(doc['revision']), 'revision');
  assertFormat(typeof doc['outdated'] === 'boolean', 'outdated');
  assertFormat(Array.isArray(doc['actionItems']), 'actionItems');
  assertFormat(Array.isArray(doc['decisions']), 'decisions');
  assertFormat(Array.isArray(doc['openQuestions']), 'openQuestions');
  assertFormat(Array.isArray(doc['warnings']), 'warnings');
  for (const body of [doc['brief'], doc['full']]) {
    assertFormat(body === null || Array.isArray((body as SummaryBody).sections), 'summary body');
  }
  return doc as unknown as SummaryFile;
}

const NOT_SPECIFIED = 'Not specified';
const UNCONFIRMED = 'Unconfirmed';

function upgradeDetail(value: unknown): { value: string | null; unconfirmed: boolean } {
  if (value === UNCONFIRMED) return { value: null, unconfirmed: true };
  if (value === NOT_SPECIFIED || typeof value !== 'string') return { value: null, unconfirmed: false };
  return { value, unconfirmed: false };
}

const UNREVIEWED = { alsoAtMs: [], needsReview: false };

function upgradeAction(item: JsonObject): JsonObject {
  const owner = upgradeDetail(item['owner']);
  const deadline = upgradeDetail(item['deadline']);
  const status = String(item['status']).toLowerCase();
  return {
    ...item,
    ...UNREVIEWED,
    owner: owner.value,
    ownerUnconfirmed: owner.unconfirmed,
    deadline: deadline.value,
    deadlineUnconfirmed: deadline.unconfirmed,
    status: status === 'agreed' || status === 'proposed' ? status : 'unconfirmed',
  };
}

function upgradeDecision(item: JsonObject): JsonObject {
  const camel = (value: unknown) =>
    typeof value === 'string' ? value.replace(/ (\w)/g, (_, letter: string) => letter.toUpperCase()) : null;
  return {
    ...item,
    ...UNREVIEWED,
    status: camel(item['status']),
    impactArea: camel(item['impactArea']),
  };
}

function upgradeBody(length: string, body: unknown): JsonObject | null {
  if (body === null) return null;
  const { text, edited } = body as { text: string; edited: boolean };
  return { sections: [{ id: `${length}-0`, heading: null, text, edited }] };
}

export const SUMMARY_FORMAT: FileFormat<SummaryFile> = {
  name: 'summary.json',
  version: 3,
  upgrades: {
    // v1 held one body of a chosen length, with no outdated tracking or edit marks.
    1: (doc) => {
      const body = { text: doc['body'], edited: false };
      const { length, ...rest } = doc;
      delete rest['body'];
      const markUnedited = (item: JsonObject): JsonObject => ({ ...item, edited: false });
      return {
        ...rest,
        revision: 0,
        transcriptRevision: 0,
        outdated: false,
        brief: length === 'brief' ? body : null,
        full: length === 'full' ? body : null,
        actionItems: (doc['actionItems'] as JsonObject[]).map(markUnedited),
        decisions: (doc['decisions'] as JsonObject[]).map(markUnedited),
        openQuestions: doc['openQuestions'] ?? [],
      };
    },
    // v2 kept narratives as one text, questions as plain strings and unknown details as words.
    2: (doc) => ({
      ...doc,
      generatedAt: null,
      brief: upgradeBody('brief', doc['brief']),
      full: upgradeBody('full', doc['full']),
      actionItems: (doc['actionItems'] as JsonObject[]).map(upgradeAction),
      decisions: (doc['decisions'] as JsonObject[]).map(upgradeDecision),
      openQuestions: (doc['openQuestions'] as string[]).map((question, index) => ({
        ...UNREVIEWED,
        id: `q-${index}`,
        question,
        sourceMs: null,
        edited: false,
      })),
      warnings: [],
    }),
  },
  validate: validateSummary,
};

function keepEdited<T extends { id: string; edited: boolean }>(previous: T[], next: T[]): T[] {
  const edited = previous.filter((item) => item.edited);
  const editedIds = new Set(edited.map((item) => item.id));
  return [...edited, ...next.filter((item) => !editedIds.has(item.id))];
}

function keepEditedBody(previous: SummaryBody | null, next: SummaryBody | null): SummaryBody | null {
  return previous?.sections.some((section) => section.edited) === true ? previous : next;
}

/** Regeneration rule: anything the user edited stays; everything else takes the new text. */
export function mergeRegeneratedSummary(
  previous: SummaryFile | null,
  next: SummaryFile,
): SummaryFile {
  if (previous === null) return next;
  return {
    ...next,
    revision: previous.revision,
    brief: keepEditedBody(previous.brief, next.brief ?? previous.brief),
    full: keepEditedBody(previous.full, next.full ?? previous.full),
    actionItems: keepEdited(previous.actionItems, next.actionItems),
    decisions: keepEdited(previous.decisions, next.decisions),
    openQuestions: keepEdited(previous.openQuestions, next.openQuestions),
  };
}
