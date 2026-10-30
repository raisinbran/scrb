import type { Section } from "./sections.js";
import { contentTokens, coverage } from "./text.js";
import { formatStamp, parseStamp } from "./time.js";
import type { EvidenceLink, ItemFlag, TranscriptLine } from "./types.js";

const NEAR_LINES = 3;
const NEAR_SECONDS = 45;
const SNAP_SECONDS = 5;
const QUOTE_SUPPORT = 0.6;
const TEXT_SUPPORT = 0.4;
const REPAIR_SUPPORT = 0.75;
const MIN_QUOTE_TOKENS = 3;

export type EvidenceResult =
  | { ok: true; link: EvidenceLink; flags: ItemFlag[] }
  | { ok: false; reason: string };

function near(lines: TranscriptLine[], section: Section, index: number): Set<string> {
  const from = Math.max(section.start, index - NEAR_LINES);
  const to = Math.min(section.end, index + NEAR_LINES + 1);
  const at = lines[index]!.startSec;
  const close = lines.slice(from, to).filter((line) => Math.abs(line.startSec - at) <= NEAR_SECONDS);
  return contentTokens(close.map((line) => line.text).join(" "));
}

function link(lines: TranscriptLine[], index: number): EvidenceLink {
  return { lineIndex: index, timestampSec: lines[index]!.startSec };
}

/**
 * Ties an item to a real line in the section it was read from. The timestamp
 * must be in that section (Phase 0 saw items shifted 30 minutes to a line that
 * does exist elsewhere), and the words there must support the item. A wrong
 * timestamp is repaired only from a quote found in the section, and flagged;
 * with no such quote the item is dropped.
 */
export function resolveEvidence(
  item: { text: string; timestamp: string; quote: string },
  lines: TranscriptLine[],
  section: Section,
): EvidenceResult {
  const quote = contentTokens(item.quote);
  const text = contentTokens(item.text);
  const stamped: number[] = [];
  for (let i = section.start; i < section.end; i += 1) {
    if (formatStamp(lines[i]!.startSec) === item.timestamp) stamped.push(i);
  }
  for (const index of stamped) {
    const context = near(lines, section, index);
    if (coverage(quote, context) >= QUOTE_SUPPORT || coverage(text, context) >= TEXT_SUPPORT) {
      return { ok: true, link: link(lines, index), flags: [] };
    }
  }

  if (quote.size >= MIN_QUOTE_TOKENS) {
    let best = -1;
    let bestScore = 0;
    for (let i = section.start; i < section.end; i += 1) {
      const score = coverage(quote, contentTokens(lines[i]!.text));
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (bestScore >= REPAIR_SUPPORT) return { ok: true, link: link(lines, best), flags: ["timestamp_repaired"] };
  }

  const first = stamped[0];
  if (first !== undefined) return { ok: true, link: link(lines, first), flags: ["weak_evidence"] };

  // Off by a few seconds from a real line: a rounding slip, not a wrong place.
  const seconds = parseStamp(item.timestamp);
  if (seconds !== null) {
    for (let i = section.start; i < section.end; i += 1) {
      if (Math.abs(lines[i]!.startSec - seconds) <= SNAP_SECONDS) {
        const context = near(lines, section, i);
        if (coverage(quote, context) >= QUOTE_SUPPORT || coverage(text, context) >= TEXT_SUPPORT) {
          return { ok: true, link: link(lines, i), flags: ["timestamp_repaired"] };
        }
      }
    }
  }
  return { ok: false, reason: `timestamp ${item.timestamp} matches no supporting line in this section` };
}
