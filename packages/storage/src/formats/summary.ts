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

function assertItems(key: string, textKey: string, items: unknown[]): void {
  for (const item of items as (JsonObject | null)[]) {
    assertFormat(
      typeof item?.['id'] === 'string' &&
        typeof item[textKey] === 'string' &&
        typeof item['edited'] === 'boolean' &&
        Array.isArray(item['alsoAtMs']),
      key,
    );
  }
}

function validateSummary(doc: JsonObject): SummaryFile {
  assertFormat(typeof doc['meetingId'] === 'string', 'meetingId');
  assertFormat(Number.isInteger(doc['revision']), 'revision');
  assertFormat(Number.isInteger(doc['transcriptRevision']), 'transcriptRevision');
  assertFormat(typeof doc['outdated'] === 'boolean', 'outdated');
  assertFormat(doc['generatedAt'] === null || typeof doc['generatedAt'] === 'string', 'generatedAt');
  assertFormat(Array.isArray(doc['actionItems']), 'actionItems');
  assertFormat(Array.isArray(doc['decisions']), 'decisions');
  assertFormat(Array.isArray(doc['openQuestions']), 'openQuestions');
  assertFormat(Array.isArray(doc['warnings']), 'warnings');
  assertItems('actionItems', 'action', doc['actionItems'] as unknown[]);
  assertItems('decisions', 'decision', doc['decisions'] as unknown[]);
  assertItems('openQuestions', 'question', doc['openQuestions'] as unknown[]);
  for (const body of [doc['brief'], doc['full']] as (SummaryBody | null | undefined)[]) {
    assertFormat(body === null || Array.isArray(body?.sections), 'summary body');
    for (const section of body?.sections ?? []) {
      assertFormat(
        typeof section?.id === 'string' &&
          typeof section.text === 'string' &&
          typeof section.edited === 'boolean',
        'summary section',
      );
    }
  }
  return doc as unknown as SummaryFile;
}

/** v2 files hold the declared lowercase words or the engine's capitalised ones. */
function wordKey(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[\s_-]+/g, '') : '';
}

const UPGRADED_DECISION_STATUS = new Map<string, DecisionStatus>([
  ['decided', 'decided'],
  ['proposed', 'proposed'],
  ['tentativelyagreed', 'tentativelyAgreed'],
  ['unresolved', 'unresolved'],
]);

const UPGRADED_IMPACT_AREA = new Map<string, ImpactArea>([
  ['scope', 'scope'],
  ['schedule', 'schedule'],
  ['cost', 'cost'],
  ['risk', 'risk'],
  ['deliverables', 'deliverables'],
  ['technicalapproach', 'technicalApproach'],
]);

function upgradeDetail(value: unknown): { value: string | null; unconfirmed: boolean } {
  const key = wordKey(value);
  if (key === 'unconfirmed') return { value: null, unconfirmed: true };
  if (key === 'notspecified' || key === '') return { value: null, unconfirmed: false };
  return { value: value as string, unconfirmed: false };
}

const UNREVIEWED = { alsoAtMs: [], needsReview: false };

function upgradeAction(item: JsonObject): JsonObject {
  const owner = upgradeDetail(item['owner']);
  const deadline = upgradeDetail(item['deadline']);
  const status = wordKey(item['status']);
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
  return {
    ...item,
    ...UNREVIEWED,
    // An unreadable status must not read as settled, so it falls back to the weakest one.
    status: UPGRADED_DECISION_STATUS.get(wordKey(item['status'])) ?? 'unresolved',
    impactArea: UPGRADED_IMPACT_AREA.get(wordKey(item['impactArea'])) ?? null,
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

/** Gives each fresh item whose id a kept edit holds a free id, so both stay addressable. */
function withFreeIds<T extends { id: string }>(fresh: T[], kept: T[]): T[] {
  const keptIds = new Set(kept.map((item) => item.id));
  const taken = new Set([...keptIds, ...fresh.map((item) => item.id)]);
  return fresh.map((item) => {
    if (!keptIds.has(item.id)) return item;
    let suffix = 2;
    while (taken.has(`${item.id}-${suffix}`)) suffix += 1;
    const id = `${item.id}-${suffix}`;
    taken.add(id);
    return { ...item, id };
  });
}

/**
 * The engine numbers ids per run, so an id alone does not identify an item across runs: a new item
 * replaces an edited one only when it also comes from the same moment.
 */
function keepEdited<T extends { id: string; edited: boolean; sourceMs: number | null }>(
  previous: T[],
  next: T[],
): T[] {
  const edited = previous.filter((item) => item.edited);
  const fresh = next.filter(
    (item) => !edited.some((old) => old.id === item.id && old.sourceMs === item.sourceMs),
  );
  return [...edited, ...withFreeIds(fresh, edited)];
}

/** An edited section keeps its place while its slot still holds the same heading. */
function keepEditedBody(previous: SummaryBody | null, next: SummaryBody | null): SummaryBody | null {
  const edits = previous?.sections.filter((section) => section.edited) ?? [];
  if (next === null || edits.length === 0) return next;
  const placed = next.sections.map(
    (section) =>
      edits.find((edit) => edit.id === section.id && edit.heading === section.heading) ?? section,
  );
  const unplaced = edits.filter((edit) => !placed.includes(edit));
  return { sections: [...withFreeIds(placed, unplaced), ...unplaced] };
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
