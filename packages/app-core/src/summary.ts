import { randomUUID } from 'node:crypto';
import {
  ContractError,
  type ActionStatus,
  type DecisionStatus,
  type ImpactArea,
  type MeetingId,
  type MeetingSummaryDoc,
  type SummaryItemUpdate,
  type SummaryState,
} from '@scrb/contracts';
import type { SummaryBody, SummaryFile, SummarySection } from '@scrb/storage';
// A relative path, because the package entry needs a build and these are only its plain types.
import {
  NOT_SPECIFIED,
  UNCONFIRMED,
  type ActionItem as EngineAction,
  type ActionStatus as EngineActionStatus,
  type BaseItem,
  type DecisionItem as EngineDecision,
  type DecisionStatus as EngineDecisionStatus,
  type ImpactArea as EngineImpactArea,
  type ImpactItem,
  type MeetingSummary,
} from '../../summary/src/types.ts';

/** What the storage package needs to save a newly generated summary. */
export type GeneratedSummary = Omit<
  SummaryFile,
  'schemaVersion' | 'meetingId' | 'revision' | 'outdated' | 'transcriptRevision'
>;

export const IMPACTS_HEADING = 'Project-impacting developments';
export const OVERVIEW_SECTION_ID = 'full-overview';
export const IMPACTS_SECTION_ID = 'full-impacts';

// Exhaustive records, so a value added to any side fails the compiler here.
const ACTION_STATUS: Record<EngineActionStatus, ActionStatus> = {
  Agreed: 'agreed',
  Proposed: 'proposed',
  Unconfirmed: 'unconfirmed',
};

const DECISION_STATUS: Record<EngineDecisionStatus, DecisionStatus> = {
  Decided: 'decided',
  Proposed: 'proposed',
  'Tentatively agreed': 'tentativelyAgreed',
  Unresolved: 'unresolved',
};

const IMPACT_AREA: Record<EngineImpactArea, ImpactArea | null> = {
  Scope: 'scope',
  Schedule: 'schedule',
  Cost: 'cost',
  Risk: 'risk',
  Deliverables: 'deliverables',
  'Technical approach': 'technicalApproach',
  'Not specified': null,
};

function detail(value: string): { value: string | null; unconfirmed: boolean } {
  if (value === UNCONFIRMED) return { value: null, unconfirmed: true };
  if (value === NOT_SPECIFIED) return { value: null, unconfirmed: false };
  return { value, unconfirmed: false };
}

function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

function evidenceOf(item: BaseItem) {
  return {
    alsoAtMs: item.alsoAt.map((link) => secondsToMs(link.timestampSec)),
    needsReview: item.flags.includes('weak_evidence') || item.flags.includes('conflict'),
    edited: false,
  };
}

function toAction(item: EngineAction): SummaryFile['actionItems'][number] {
  const owner = detail(item.owner);
  const deadline = detail(item.deadline);
  return {
    id: item.id,
    action: item.text,
    owner: owner.value,
    ownerUnconfirmed: owner.unconfirmed,
    deadline: deadline.value,
    deadlineUnconfirmed: deadline.unconfirmed,
    status: ACTION_STATUS[item.status],
    sourceMs: secondsToMs(item.evidence.timestampSec),
    ...evidenceOf(item),
  };
}

function toDecision(item: EngineDecision): SummaryFile['decisions'][number] {
  return {
    id: item.id,
    decision: item.text,
    status: DECISION_STATUS[item.status],
    impactArea: IMPACT_AREA[item.impactArea],
    sourceMs: secondsToMs(item.evidence.timestampSec),
    ...evidenceOf(item),
  };
}

/** An inferred impact is labelled, so it can never read as confirmed. */
function impactLine(item: ImpactItem): string {
  return item.basis === 'Inferred' ? `Inferred: ${item.text}` : item.text;
}

function section(id: string, heading: string | null, text: string): SummarySection {
  return { id, heading, text, edited: false };
}

function toBody(summary: MeetingSummary): SummaryBody {
  const { body } = summary;
  if (body.length === 'brief') {
    return {
      sections: body.paragraphs.map((text, index) => section(`brief-${index}`, null, text)),
    };
  }
  const sections = [
    section(OVERVIEW_SECTION_ID, 'Overview', body.overview),
    ...body.mainTopics.map((topic, index) =>
      section(`full-topic-${index}`, topic.title, topic.summary),
    ),
  ];
  if (summary.impacts.length > 0) {
    const text = summary.impacts.map(impactLine).join('\n');
    sections.push(section(IMPACTS_SECTION_ID, IMPACTS_HEADING, text));
  }
  return { sections };
}

/** Summary engine to storage. The length not generated stays null, so storage keeps the old one. */
export function toGeneratedSummary(summary: MeetingSummary, generatedAt: string): GeneratedSummary {
  const body = toBody(summary);
  return {
    generatedAt,
    brief: summary.body.length === 'brief' ? body : null,
    full: summary.body.length === 'full' ? body : null,
    actionItems: summary.actions.map(toAction),
    decisions: summary.decisions.map(toDecision),
    openQuestions: summary.openQuestions.map((item) => ({
      id: item.id,
      question: item.text,
      sourceMs: secondsToMs(item.evidence.timestampSec),
      ...evidenceOf(item),
    })),
    warnings: summary.warnings,
  };
}

/** Where each transcript segment lies, in the same clock as `sourceMs`. */
export interface SegmentSpan {
  startMs: number;
  endMs: number;
}

/** An item between segments is moved to the nearest segment start only within this distance. */
export const LINK_REMAP_WINDOW_MS = 5000;
export const DROPPED_ITEMS_WARNING =
  'items were left out because their place in the recording could not be found';

type Resolved = { ms: number; remapped: boolean } | null;

function resolveLink(ms: number, segments: readonly SegmentSpan[]): Resolved {
  if (segments.some((span) => ms >= span.startMs && ms <= span.endMs)) {
    return { ms, remapped: false };
  }
  const first = Math.min(...segments.map((span) => span.startMs));
  const last = Math.max(...segments.map((span) => span.endMs));
  if (!(ms >= first && ms <= last)) return null;
  const distance = (span: SegmentSpan) =>
    Math.min(Math.abs(span.startMs - ms), Math.abs(span.endMs - ms));
  const nearest = segments.reduce((best, span) => (distance(span) < distance(best) ? span : best));
  if (distance(nearest) > LINK_REMAP_WINDOW_MS) return null;
  return { ms: nearest.startMs, remapped: true };
}

function guardItems<
  T extends { sourceMs: number | null; alsoAtMs: number[]; needsReview: boolean },
>(items: T[], segments: readonly SegmentSpan[]): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let dropped = 0;
  for (const item of items) {
    // Only an open question may have no time of its own.
    const own =
      item.sourceMs === null ? { ms: null, remapped: false } : resolveLink(item.sourceMs, segments);
    if (!own) {
      dropped += 1;
      continue;
    }
    let remapped = own.remapped;
    const alsoAtMs: number[] = [];
    for (const ms of item.alsoAtMs) {
      const link = resolveLink(ms, segments);
      if (!link) continue;
      remapped ||= link.remapped;
      if (link.ms !== own.ms && !alsoAtMs.includes(link.ms)) alsoAtMs.push(link.ms);
    }
    kept.push({ ...item, sourceMs: own.ms, alsoAtMs, needsReview: item.needsReview || remapped });
  }
  return { kept, dropped };
}

/**
 * Makes every saved link point at real transcript text. A link inside a segment stays. One in a
 * gap close to a segment moves to that segment's start and the item is marked for review. A bad
 * `alsoAtMs` entry is removed; an item whose own time is bad is dropped and the user is told.
 * An open question with no time (null) is allowed.
 */
export function guardSummaryLinks(
  summary: GeneratedSummary,
  segments: readonly SegmentSpan[],
): GeneratedSummary {
  const actions = guardItems(summary.actionItems, segments);
  const decisions = guardItems(summary.decisions, segments);
  const questions = guardItems(summary.openQuestions, segments);
  const dropped = actions.dropped + decisions.dropped + questions.dropped;
  return {
    ...summary,
    actionItems: actions.kept,
    decisions: decisions.kept,
    openQuestions: questions.kept,
    warnings:
      dropped === 0
        ? summary.warnings
        : [...summary.warnings, `${dropped} ${DROPPED_ITEMS_WARNING}.`],
  };
}

function requireLinks(times: Array<number | null>, segments?: readonly SegmentSpan[]): void {
  if (!segments) return;
  for (const ms of times) {
    if (ms !== null && !segments.some((span) => ms >= span.startMs && ms <= span.endMs)) {
      throw new ContractError({
        code: 'invalidRequest',
        message: 'That time is outside the meeting transcript.',
      });
    }
  }
}

/** An edit may keep an old link, but a new one must lie inside the transcript. */
function requireChangedLink(
  items: Array<{ id: string; sourceMs: number | null }>,
  item: { id: string; sourceMs: number | null },
  segments?: readonly SegmentSpan[],
): void {
  if (items.find((existing) => existing.id === item.id)?.sourceMs !== item.sourceMs) {
    requireLinks([item.sourceMs], segments);
  }
}

function stateOf(file: SummaryFile): SummaryState {
  if (file.outdated) return 'outdated';
  const items = [...file.actionItems, ...file.decisions, ...file.openQuestions];
  const sections = [...(file.brief?.sections ?? []), ...(file.full?.sections ?? [])];
  return [...items, ...sections].some((item) => item.edited) ? 'edited' : 'ready';
}

/** Storage to the UI. `generating` comes from the running job, which storage does not know about. */
export function toSummaryDoc(
  meetingId: MeetingId,
  file: SummaryFile | null,
  generating = false,
): MeetingSummaryDoc {
  const running: SummaryState | null = generating ? 'generating' : null;
  if (file === null) {
    return {
      meetingId,
      state: running ?? 'notGenerated',
      generatedAt: null,
      narrative: { brief: null, full: null },
      actionItems: [],
      decisions: [],
      openQuestions: [],
      warnings: [],
    };
  }
  return {
    meetingId,
    state: running ?? stateOf(file),
    generatedAt: file.generatedAt,
    narrative: { brief: file.brief?.sections ?? null, full: file.full?.sections ?? null },
    actionItems: file.actionItems,
    decisions: file.decisions,
    openQuestions: file.openQuestions,
    warnings: file.warnings,
  };
}

function replaced<T extends { id: string }>(items: T[], item: T): T[] {
  if (!items.some((existing) => existing.id === item.id)) {
    throw new ContractError({ code: 'notFound', message: 'That summary item no longer exists.' });
  }
  return items.map((existing) => (existing.id === item.id ? item : existing));
}

function replacedInBody(body: SummaryBody | null, item: SummarySection): SummaryBody | null {
  if (!body?.sections.some((existing) => existing.id === item.id)) return body;
  return { sections: replaced(body.sections, item) };
}

function removed<T extends { id: string }>(items: T[], id: string): T[] {
  if (!items.some((item) => item.id === id)) {
    throw new ContractError({ code: 'notFound', message: 'That summary item no longer exists.' });
  }
  return items.filter((item) => item.id !== id);
}

/** One user edit, marked so regenerating cannot overwrite it. */
export function applySummaryUpdate(
  file: SummaryFile,
  update: SummaryItemUpdate,
  segments?: readonly SegmentSpan[],
): SummaryFile {
  switch (update.kind) {
    case 'add': {
      requireLinks([update.item.sourceMs], segments);
      const evidence = { alsoAtMs: [], needsReview: false, edited: true };
      switch (update.collection) {
        case 'actionItems':
          return {
            ...file,
            actionItems: [...file.actionItems, { ...update.item, id: randomUUID(), ...evidence }],
          };
        case 'decisions':
          return {
            ...file,
            decisions: [...file.decisions, { ...update.item, id: randomUUID(), ...evidence }],
          };
        case 'openQuestions':
          return {
            ...file,
            openQuestions: [
              ...file.openQuestions,
              { ...update.item, id: randomUUID(), ...evidence },
            ],
          };
      }
      throw new ContractError({ code: 'invalidRequest', message: 'Unknown summary collection.' });
    }
    case 'remove':
      switch (update.collection) {
        case 'actionItems':
          return { ...file, actionItems: removed(file.actionItems, update.itemId) };
        case 'decisions':
          return { ...file, decisions: removed(file.decisions, update.itemId) };
        case 'openQuestions':
          return { ...file, openQuestions: removed(file.openQuestions, update.itemId) };
      }
      throw new ContractError({ code: 'invalidRequest', message: 'Unknown summary collection.' });
    case 'narrative': {
      const item = { ...update.item, edited: true };
      const brief = replacedInBody(file.brief, item);
      const full = replacedInBody(file.full, item);
      if (brief === file.brief && full === file.full) replaced([], item);
      return { ...file, brief, full };
    }
    case 'actionItem':
      requireChangedLink(file.actionItems, update.item, segments);
      return {
        ...file,
        actionItems: replaced(file.actionItems, { ...update.item, edited: true }),
      };
    case 'decision':
      requireChangedLink(file.decisions, update.item, segments);
      return { ...file, decisions: replaced(file.decisions, { ...update.item, edited: true }) };
    case 'openQuestion':
      requireChangedLink(file.openQuestions, update.item, segments);
      return {
        ...file,
        openQuestions: replaced(file.openQuestions, { ...update.item, edited: true }),
      };
  }
}
