import { parseStamp } from "../src/time.js";
import type { Transcript } from "../src/types.js";

/** Reads the '[mm:ss] A: words' fixture format. */
export function parseTranscript(text: string): Transcript {
  const lines = [];
  for (const raw of text.split("\n")) {
    const match = /^\[(\d{2,3}:\d{2})\] ([^:]+): (.*)$/.exec(raw);
    if (match) lines.push({ startSec: parseStamp(match[1]!)!, speaker: match[2]!, text: match[3]! });
  }
  return { lines };
}
