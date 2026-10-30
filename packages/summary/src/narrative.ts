import { completeStructured, type LlmClient } from "./llm.js";
import { BRIEF_SYSTEM, FULL_SYSTEM } from "./prompts.js";
import { BRIEF_SCHEMA, FULL_SCHEMA } from "./schema.js";
import { words } from "./text.js";
import type { BriefBody, Extraction, FullBody, MeetingSummary, SummaryLength } from "./types.js";

const MAX_TOKENS = 1600;
const BRIEF_WORD_LIMIT = 300;
const FULL_WORD_LIMIT = 1000;

/** The prose sees only checked items, so it cannot pull in something the tables dropped. */
export function notesFor(extraction: Extraction): string {
  const out: string[] = ["What was covered, in order:"];
  for (const gist of extraction.gists) out.push(`- ${gist}`);
  out.push("", "Decisions:");
  for (const item of extraction.decisions) out.push(`- [${item.status}] ${item.text}`);
  out.push("", "Action items:");
  for (const item of extraction.actions) out.push(`- ${item.text} (owner: ${item.owner}; deadline: ${item.deadline})`);
  if (extraction.impacts.length > 0) {
    out.push("", "Project impacts:");
    for (const item of extraction.impacts) out.push(`- [${item.basis}] ${item.text}`);
  }
  if (extraction.openQuestions.length > 0) {
    out.push("", "Open questions:");
    for (const item of extraction.openQuestions) out.push(`- ${item.text}`);
  }
  return out.join("\n");
}

/** Numbers are the invented detail a reader is most likely to trust. */
export function unsupportedNumbers(prose: string, notes: string): string[] {
  const known = new Set(words(notes));
  return [...new Set(words(prose).filter((word) => /\d/.test(word) && !known.has(word)))];
}

function fallbackBody(extraction: Extraction, length: SummaryLength): BriefBody | FullBody {
  const text = extraction.gists.join(" ") || "No summary text could be written for this meeting.";
  return length === "brief"
    ? { length, paragraphs: [text] }
    : { length, overview: text, mainTopics: [] };
}

function proseOf(body: BriefBody | FullBody): string {
  return body.length === "brief"
    ? body.paragraphs.join("\n\n")
    : [body.overview, ...body.mainTopics.flatMap((topic) => [topic.title, topic.summary])].join("\n\n");
}

async function writeBody(
  extraction: Extraction,
  llm: LlmClient,
  length: SummaryLength,
  notes: string,
  signal?: AbortSignal,
): Promise<BriefBody | FullBody | null> {
  const result = await completeStructured(llm, {
    messages: [
      { role: "system", content: length === "brief" ? BRIEF_SYSTEM : FULL_SYSTEM },
      { role: "user", content: notes },
    ],
    schema: length === "brief" ? BRIEF_SCHEMA : FULL_SCHEMA,
    maxTokens: MAX_TOKENS,
    signal,
  });
  if (result.value === null) return null;
  if (length === "brief") {
    const { paragraphs } = result.value as { paragraphs: string[] };
    return { length, paragraphs: paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean) };
  }
  const { overview, main_topics } = result.value as { overview: string; main_topics: { title: string; summary: string }[] };
  return { length, overview: overview.trim(), mainTopics: main_topics };
}

/** Step two: prose around the same tables, whichever length is asked for. */
export async function writeSummary(
  extraction: Extraction,
  llm: LlmClient,
  length: SummaryLength,
  options: { signal?: AbortSignal } = {},
): Promise<MeetingSummary> {
  const warnings = [...extraction.warnings];
  const notes = notesFor(extraction);
  let body = await writeBody(extraction, llm, length, notes, options.signal);
  if (body === null) {
    warnings.push("The summary text could not be written; the section notes are shown instead.");
    body = fallbackBody(extraction, length);
  }
  const prose = proseOf(body);
  const count = words(prose).length;
  const limit = length === "brief" ? BRIEF_WORD_LIMIT : FULL_WORD_LIMIT;
  if (count > limit) warnings.push(`The summary text runs to ${count} words, over the ${limit} word limit.`);
  const unsupported = unsupportedNumbers(prose, notes);
  if (unsupported.length > 0) warnings.push(`The summary text has numbers not found in the notes: ${unsupported.join(", ")}.`);
  return {
    schemaVersion: 1,
    sourceHash: extraction.sourceHash,
    model: llm.modelName,
    body,
    actions: extraction.actions,
    decisions: extraction.decisions,
    impacts: extraction.impacts,
    openQuestions: extraction.openQuestions,
    warnings,
  };
}

