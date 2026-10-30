import { formatStamp } from "./time.js";
import type { TranscriptLine } from "./types.js";

export interface Section {
  /** First line, inclusive. */
  start: number;
  /** Last line, exclusive. */
  end: number;
  text: string;
}

export function formatLine(line: TranscriptLine): string {
  return `[${formatStamp(line.startSec)}] ${line.speaker}: ${line.text}`;
}

export function sectionOf(lines: TranscriptLine[], start: number, end: number): Section {
  const text = lines.slice(start, end).map(formatLine).join("\n");
  return { start, end, text };
}

/**
 * Splits on line boundaries into sections of about `maxChars`, each starting
 * `overlapChars` before the last one ended, so that an item spoken across a
 * boundary is whole in at least one section. Dedupe removes the double reading.
 */
export function splitSections(lines: TranscriptLine[], maxChars: number, overlapChars: number): Section[] {
  const total = lines.reduce((sum, line) => sum + formatLine(line).length + 1, 0);
  if (lines.length === 0) return [];
  if (total <= maxChars) return [sectionOf(lines, 0, lines.length)];
  // Even sections, so the last one is not a fragment.
  const count = Math.ceil((total - overlapChars) / (maxChars - overlapChars));
  const target = (total - overlapChars) / count + overlapChars;
  const sections: Section[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let size = 0;
    while (end < lines.length && (end === start || size + formatLine(lines[end]!).length + 1 <= target)) {
      size += formatLine(lines[end]!).length + 1;
      end += 1;
    }
    if (sections.length === count - 1) end = lines.length;
    sections.push(sectionOf(lines, start, end));
    if (end === lines.length) break;
    let back = end;
    let overlap = 0;
    while (back > start + 1 && overlap < overlapChars) {
      back -= 1;
      overlap += formatLine(lines[back]!).length + 1;
    }
    start = back;
  }
  return sections;
}
