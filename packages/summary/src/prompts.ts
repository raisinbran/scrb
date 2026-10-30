const LINE_FORMAT = "Each transcript line is '[mm:ss] SPEAKER: words'.";

const EVIDENCE_RULES =
  "For each item give the [mm:ss] timestamp of the transcript line that best supports it, copied exactly as it " +
  "appears, and in 'quote' copy a few words from that line. Use only what the transcript supports; do not invent " +
  "items. If an owner or deadline is not clearly stated, write 'Not specified'; never guess one.";

export function primarySystem(speakers: string[]): string {
  return (
    `You extract structured notes from meeting transcripts. ${LINE_FORMAT} Speakers: ${speakers.join(", ")}. ` +
    "Write a one-sentence 'gist' of what this part of the meeting covered. " +
    "List every action item (a task someone agreed or was assigned to do after the meeting), every decision " +
    "(something the group agreed or settled, with its status: decided, proposed, tentatively agreed or unresolved, " +
    "and the area it affects), every impact (a development that changes the project's scope, schedule, cost, risks " +
    "or deliverables; basis 'stated' if someone said so, 'inferred' if you are concluding it), and every open " +
    "question (raised and left unanswered in this part). " +
    "Do not list greetings, role introductions, the agenda, the running order or remarks about the meeting itself. " +
    EVIDENCE_RULES
  );
}

export interface CoverageFocus {
  name: string;
  schemaKey: "action_items" | "decisions";
  instruction: string;
}

/**
 * The narrow coverage pass: one question, one short stretch of transcript, and
 * no list of earlier items, because given such a list in Phase 0 the model only
 * rephrased it. Dedupe removes what the first pass already has.
 */
export const COVERAGE_FOCI: CoverageFocus[] = [
  {
    name: "coverage-next-steps",
    schemaKey: "action_items",
    instruction:
      "List only follow-up work: a task that a person or the whole group took on, to be done after this meeting has " +
      "ended. Include work assigned in passing, each person's task for the next meeting, and things to prepare, " +
      "present, send, post or find out next time. Not what people do during this meeting, not their general job " +
      "description, and not a topic someone only mentioned.",
  },
  {
    name: "coverage-settled",
    schemaKey: "decisions",
    instruction:
      "List only points now settled for the project: a choice the group accepted, an option ruled out, or a " +
      "requirement stated as given (including instructions passed on from management or a client) that nobody " +
      "challenged. Not a fact about how things work, not a finding from a presentation, not a suggestion that " +
      "nobody took up, and not the meeting's own arrangements.",
  },
];

export function coverageSystem(focus: CoverageFocus, speakers: string[]): string {
  return `You check a short stretch of a meeting transcript. ${LINE_FORMAT} Speakers: ${speakers.join(", ")}. ${focus.instruction} Write each item as your own one complete sentence, never as a copied transcript line. Only the most important few; an empty list is a good answer. ${EVIDENCE_RULES}`;
}

const PROSE_RULES =
  "Write only from the notes given; add no fact, name, number or date that is not in them. A decision with status " +
  "other than decided must be described as such (proposed, tentative or unresolved), never as settled. Refer to " +
  "people as the notes do. Plain language, no headings, no bullet points.";

export const BRIEF_SYSTEM =
  "You write the summary of a meeting from structured notes, short enough for an email. Up to three paragraphs and " +
  `at most 220 words in all: what the meeting was about, what was settled, and what happens next. ${PROSE_RULES}`;

export const FULL_SYSTEM =
  "You write the summary of a meeting from structured notes. Give an 'overview' of about 100 words, and " +
  "'main_topics': the three to six subjects discussed, in order, each with a short title and a paragraph of 60 to " +
  `100 words on what was said and where it ended up. ${PROSE_RULES}`;
