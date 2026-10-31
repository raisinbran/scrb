import type {
  ActionStatus,
  DecisionStatus,
  ImpactArea,
  ImportStage,
  MeetingStatus,
  SummaryStage,
  SummaryState,
} from '@scrb/contracts';

export const STATUS_LABELS: Partial<Record<MeetingStatus, string>> = {
  recording: 'Recording',
  paused: 'Paused',
  finalPassRunning: 'Final pass running',
  transcriptionFailed: 'Transcription failed',
  recovered: 'Recovered after crash',
  importing: 'Importing',
  deleting: 'Deleting',
};

export const SUMMARY_STATE_LABELS: Partial<Record<SummaryState, string>> = {
  generating: 'Summary generating',
  ready: 'Summary ready',
  edited: 'Summary edited',
  outdated: 'May be outdated',
};

export const IMPORT_STAGE_LABELS: Record<ImportStage, string> = {
  queued: 'Waiting to start',
  decoding: 'Reading the file',
  transcribing: 'Transcribing',
  diarizing: 'Separating speakers',
  finishing: 'Finishing',
};

export const SUMMARY_STAGE_LABELS: Record<SummaryStage, string> = {
  extracting: 'Finding actions and decisions',
  coverageCheck: 'Checking for missed items',
  writing: 'Writing the summary',
  done: 'Done',
  failed: 'Failed',
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  agreed: 'Agreed',
  proposed: 'Proposed',
  unconfirmed: 'Unconfirmed',
};

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  decided: 'Decided',
  proposed: 'Proposed',
  tentativelyAgreed: 'Tentatively agreed',
  unresolved: 'Unresolved',
};

export const IMPACT_LABELS: Record<ImpactArea, string> = {
  scope: 'Scope',
  schedule: 'Schedule',
  cost: 'Cost',
  risk: 'Risk',
  deliverables: 'Deliverables',
  technicalApproach: 'Technical approach',
};

/** Statuses the backend moves on from by itself, so the screen has to look again. */
export function isTransient(status: MeetingStatus, summaryState: SummaryState): boolean {
  return (
    status === 'finalPassRunning' ||
    status === 'importing' ||
    status === 'deleting' ||
    summaryState === 'generating'
  );
}

/** Still being captured or built, so its transcript is not final. */
export function isUnfinished(status: MeetingStatus): boolean {
  return (
    status === 'recording' ||
    status === 'paused' ||
    status === 'finalPassRunning' ||
    status === 'importing'
  );
}
