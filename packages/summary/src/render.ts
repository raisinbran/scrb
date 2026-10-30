import { formatStamp } from "./time.js";
import type { BaseItem, ItemFlag, MeetingSummary } from "./types.js";

const FLAG_NOTES: Record<ItemFlag, string> = {
  timestamp_repaired: "timestamp corrected",
  weak_evidence: "check source",
  owner_unconfirmed: "owner unclear",
  deadline_unconfirmed: "date unclear",
  conflict: "conflicts with another decision",
};

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function source(item: BaseItem): string {
  const stamp = formatStamp(item.evidence.timestampSec);
  return item.flags.length === 0 ? stamp : `${stamp} (${item.flags.map((flag) => FLAG_NOTES[flag]).join(", ")})`;
}

/** Plain-text form of the whole summary; review and tests read this, export has its own layout. */
export function renderMarkdown(summary: MeetingSummary): string {
  const out: string[] = [];
  if (summary.body.length === "brief") {
    out.push(...summary.body.paragraphs.flatMap((paragraph) => [paragraph, ""]));
  } else {
    out.push("## Overview", "", summary.body.overview, "", "## Main topics", "");
    for (const topic of summary.body.mainTopics) out.push(`### ${topic.title}`, "", topic.summary, "");
    const critical = summary.decisions.filter((item) => item.status === "Decided");
    if (critical.length > 0) {
      out.push("## Critical decisions", "", ...critical.map((item) => `- ${item.text} [${formatStamp(item.evidence.timestampSec)}]`), "");
    }
    if (summary.impacts.length > 0) {
      out.push("## Project-impacting developments", "");
      for (const item of summary.impacts) {
        out.push(`- ${item.basis === "Inferred" ? "Possible impact (inferred, not stated): " : ""}${item.text} [${formatStamp(item.evidence.timestampSec)}]`);
      }
      out.push("");
    }
    if (summary.openQuestions.length > 0) {
      out.push("## Open questions", "", ...summary.openQuestions.map((item) => `- ${item.text} [${formatStamp(item.evidence.timestampSec)}]`), "");
    }
  }
  out.push("## Action items", "", "| Action | Owner | Deadline | Status | Source |", "| --- | --- | --- | --- | --- |");
  for (const item of summary.actions) {
    out.push(`| ${cell(item.text)} | ${cell(item.owner)} | ${cell(item.deadline)} | ${item.status} | ${source(item)} |`);
  }
  out.push("", "## Decisions", "", "| Decision | Status | Impact area | Source |", "| --- | --- | --- | --- |");
  for (const item of summary.decisions) {
    out.push(`| ${cell(item.text)} | ${item.status} | ${item.impactArea} | ${source(item)} |`);
  }
  for (const warning of summary.warnings) out.push("", `> ${warning}`);
  return `${out.join("\n")}\n`;
}
