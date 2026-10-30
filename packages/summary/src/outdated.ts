import { createHash } from "node:crypto";
import type { MeetingSummary, Transcript } from "./types.js";

export const OUTDATED_MESSAGE = "May be outdated — regenerate?";

/** Covers everything a summary reads, so a text fix, speaker rename or retime each changes it. */
export function transcriptHash(transcript: Transcript): string {
  const hash = createHash("sha256");
  for (const line of transcript.lines) {
    hash.update(JSON.stringify([line.startSec, line.speaker, line.text]));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function isOutdated(summary: Pick<MeetingSummary, "sourceHash">, transcript: Transcript): boolean {
  return summary.sourceHash !== transcriptHash(transcript);
}
