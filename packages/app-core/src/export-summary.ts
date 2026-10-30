import type {
  ActionItem,
  ActionStatus,
  Decision,
  DecisionStatus,
  ImpactArea,
  SummaryBody,
  SummaryFile,
} from '@scrb/storage';
// Relative paths, because the package entries need a build and these are only plain types.
import type {
  ExportActionItem,
  ExportDecision,
  ExportFullSummary,
  ExportSummary,
  ExportTopic,
  DecisionStatus as ExportDecisionStatus,
  ImpactArea as ExportImpactArea,
} from '../../export/src/types.ts';
import { UNCONFIRMED } from '../../summary/src/types.ts';
import { IMPACTS_SECTION_ID, OVERVIEW_SECTION_ID } from './summary.ts';

// Exhaustive records, so a value added to either side fails the compiler here.
// Export prints this status verbatim, and prints null as "Unconfirmed".
const ACTION_STATUS: Record<ActionStatus, string | null> = {
  agreed: 'Agreed',
  proposed: 'Proposed',
  unconfirmed: null,
};

const DECISION_STATUS: Record<DecisionStatus, ExportDecisionStatus> = {
  decided: 'decided',
  proposed: 'proposed',
  tentativelyAgreed: 'tentatively-agreed',
  unresolved: 'unresolved',
};

const IMPACT_AREA: Record<ImpactArea, ExportImpactArea> = {
  scope: 'scope',
  schedule: 'schedule',
  cost: 'cost',
  risk: 'risk',
  deliverables: 'deliverables',
  technicalApproach: 'technical-approach',
};

/** Export flattens a string to one line, so each line break has to become its own entry. */
function linesOf(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** Export prints an empty value as "Not specified" even when flagged, so the word itself goes in. */
function detail(raw: string | null, unconfirmed: boolean) {
  const value = raw?.trim() ? raw : null;
  if (value === null && unconfirmed) return { value: UNCONFIRMED, unconfirmed: false };
  return { value, unconfirmed };
}

function toAction(item: ActionItem): ExportActionItem {
  const owner = detail(item.owner, item.ownerUnconfirmed);
  const deadline = detail(item.deadline, item.deadlineUnconfirmed);
  return {
    action: item.action,
    owner: owner.value,
    ownerUnconfirmed: owner.unconfirmed,
    deadline: deadline.value,
    deadlineUnconfirmed: deadline.unconfirmed,
    status: ACTION_STATUS[item.status],
    sourceMs: item.sourceMs,
  };
}

function toDecision(item: Decision): ExportDecision {
  // Upgraded v2 files can hold "notSpecified", which the upgrade does not turn into null.
  const impactArea = item.impactArea === null ? null : (IMPACT_AREA[item.impactArea] ?? null);
  return {
    decision: item.decision,
    status: DECISION_STATUS[item.status],
    impactArea,
    // A decision records no basis for its area, so no area can be shown as confirmed.
    impactInferred: impactArea !== null,
    sourceMs: item.sourceMs,
  };
}

function toBrief(body: SummaryBody): string[] {
  return body.sections.flatMap((item) => linesOf(`${item.heading ?? ''}\n${item.text}`));
}

function toFull(body: SummaryBody, decisions: Decision[]): ExportFullSummary {
  const overview: string[] = [];
  const mainTopics: ExportTopic[] = [];
  const projectDevelopments: string[] = [];
  for (const { id, heading, text } of body.sections) {
    const title = heading?.trim();
    if (id === IMPACTS_SECTION_ID) projectDevelopments.push(...linesOf(text));
    // An upgraded v2 file keeps its whole narrative in one section with no heading.
    else if (id === OVERVIEW_SECTION_ID || !title) overview.push(...linesOf(text));
    else mainTopics.push({ title, paragraphs: linesOf(text) });
  }
  return {
    overview,
    mainTopics,
    // The rule the summary engine's own Markdown uses.
    criticalDecisions: decisions
      .filter((item) => item.status === 'decided')
      .map((item) => ({ text: item.decision, sourceMs: item.sourceMs })),
    // The file keeps impacts only as text. Each line keeps its "Inferred:" label from summary.ts.
    projectDevelopments: projectDevelopments.map((text) => ({ text, sourceMs: null })),
  };
}

/** Storage to the export package. Null means no summary, which export reports as `no-summary`. */
export function toExportSummary(file: SummaryFile | null): ExportSummary | null {
  if (file === null) return null;
  return {
    brief: file.brief === null ? null : toBrief(file.brief),
    full: file.full === null ? null : toFull(file.full, file.decisions),
    openQuestions: file.openQuestions.map((item) => ({
      text: item.question,
      sourceMs: item.sourceMs,
    })),
    actionItems: file.actionItems.map(toAction),
    decisions: file.decisions.map(toDecision),
    outdated: file.outdated,
    warnings: file.warnings,
  };
}
