import { assertFormat, type FileFormat, type JsonObject } from './versioned.ts';

export type DecisionStatus = 'decided' | 'proposed' | 'tentatively agreed' | 'unresolved';
export type ImpactArea =
  | 'scope'
  | 'schedule'
  | 'cost'
  | 'risk'
  | 'deliverables'
  | 'technical approach';

export interface ActionItem {
  id: string;
  action: string;
  /** "Not specified" or "Unconfirmed" when the transcript does not say. */
  owner: string;
  deadline: string;
  status: string;
  sourceMs: number;
  edited: boolean;
}

export interface Decision {
  id: string;
  decision: string;
  status: DecisionStatus;
  impactArea: ImpactArea;
  sourceMs: number;
  edited: boolean;
}

export interface SummaryBody {
  text: string;
  edited: boolean;
}

/** `summary.json`: one or both lengths, always with the full tables. */
export interface SummaryFile {
  schemaVersion: 2;
  meetingId: string;
  revision: number;
  /** The transcript revision this was generated from. */
  transcriptRevision: number;
  /** "May be outdated": set by any transcript or speaker edit after generating. */
  outdated: boolean;
  brief: SummaryBody | null;
  full: SummaryBody | null;
  actionItems: ActionItem[];
  decisions: Decision[];
  openQuestions: string[];
}

function validateSummary(doc: JsonObject): SummaryFile {
  assertFormat(typeof doc['meetingId'] === 'string', 'meetingId');
  assertFormat(Number.isInteger(doc['revision']), 'revision');
  assertFormat(typeof doc['outdated'] === 'boolean', 'outdated');
  assertFormat(Array.isArray(doc['actionItems']), 'actionItems');
  assertFormat(Array.isArray(doc['decisions']), 'decisions');
  assertFormat(Array.isArray(doc['openQuestions']), 'openQuestions');
  for (const body of [doc['brief'], doc['full']]) {
    assertFormat(body === null || typeof (body as SummaryBody).text === 'string', 'summary body');
  }
  return doc as unknown as SummaryFile;
}

export const SUMMARY_FORMAT: FileFormat<SummaryFile> = {
  name: 'summary.json',
  version: 2,
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
  },
  validate: validateSummary,
};

function keepEdited<T extends { id: string; edited: boolean }>(previous: T[], next: T[]): T[] {
  const edited = previous.filter((item) => item.edited);
  const editedIds = new Set(edited.map((item) => item.id));
  return [...edited, ...next.filter((item) => !editedIds.has(item.id))];
}

function keepEditedBody(previous: SummaryBody | null, next: SummaryBody | null): SummaryBody | null {
  return previous?.edited === true ? previous : next;
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
  };
}
