import { completeStructured, type LlmClient } from "./llm.js";
import { formatLine } from "./sections.js";
import { contentTokens } from "./text.js";
import type { Transcript } from "./types.js";

export const TITLE_MAX_WORDS = 10;
export const TITLE_MAX_CHARS = 60;
const EXCERPT_CHARS = 8000;
const GENERIC = new Set(["meeting", "untitled", "untitled meeting", "meeting summary", "summary", "transcript", "title", "n/a", "none"]);

const TITLE_SYSTEM =
  "You name meetings from their transcripts. Each transcript line is '[mm:ss] SPEAKER: words'. " +
  "Give a short title of 2 to 8 words that names the overall topic of the meeting, in the style of a calendar " +
  "entry, for example 'Quarterly Budget Review'. Plain text only: no quotes, no date, no trailing punctuation. " +
  "Use only subjects, names and terms that appear in the transcript; never invent a name, number, company or " +
  "detail. If you cannot tell what the meeting was about, answer 'Meeting'.";

const TITLE_SCHEMA = {
  type: "object",
  properties: { title: { type: "string", maxLength: 120 } },
  required: ["title"],
};

/** Evenly spaced lines up to a character budget, so a long meeting is represented end to end. */
export function excerptOf(transcript: Transcript, budget = EXCERPT_CHARS): string {
  const formatted = transcript.lines.map(formatLine);
  const total = formatted.reduce((sum, line) => sum + line.length + 1, 0);
  if (total <= budget) return formatted.join("\n");
  const step = total / budget;
  const kept: string[] = [];
  let used = 0;
  for (let i = 0; i < formatted.length; i += Math.max(1, Math.ceil(step))) {
    const line = formatted[i]!.slice(0, 400);
    if (used + line.length + 1 > budget) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept.join("\n");
}

/** Turns model output into a plain title, or null when nothing usable is left. */
export function cleanTitle(raw: string): string | null {
  let text = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/["“”„«»`*_#<>[\]{}|\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^(title|meeting title)\s*:\s*/i, "").replace(/^\d{8}\s+/, "");
  text = text.replace(/^[\s'’.,;:!?\-–—…]+|[\s'’.,;:!?\-–—…]+$/g, "");
  const parts = text.split(" ").filter(Boolean).slice(0, TITLE_MAX_WORDS);
  let title = parts.join(" ");
  while (title.length > TITLE_MAX_CHARS && parts.length > 1) {
    parts.pop();
    title = parts.join(" ");
  }
  title = title.slice(0, TITLE_MAX_CHARS).replace(/[\s'’.,;:!?\-–—…]+$/g, "");
  return title && !GENERIC.has(title.toLowerCase()) ? title : null;
}

/**
 * A short plain-text title, or null when the model gave nothing usable. A title that shares no
 * content word with the transcript is treated as invented and dropped.
 */
export async function generateTitle(
  transcript: Transcript,
  llm: LlmClient,
  options: { signal?: AbortSignal } = {},
): Promise<string | null> {
  if (transcript.lines.length === 0) return null;
  const result = await completeStructured(llm, {
    messages: [
      { role: "system", content: TITLE_SYSTEM },
      { role: "user", content: excerptOf(transcript) },
    ],
    schema: TITLE_SCHEMA,
    maxTokens: 64,
    signal: options.signal,
  });
  const value = result.value as { title?: unknown } | null;
  if (!value || typeof value.title !== "string") return null;
  const title = cleanTitle(value.title);
  if (!title) return null;
  const spoken = contentTokens(transcript.lines.map((line) => line.text).join(" "));
  for (const token of contentTokens(title)) if (spoken.has(token)) return title;
  return null;
}
