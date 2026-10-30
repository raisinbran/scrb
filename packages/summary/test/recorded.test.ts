import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { parseTranscript } from "../eval/fixture.js";
import { ReplayLlm, type Recording } from "../eval/record.js";
import { extractItems, isOutdated, renderMarkdown, writeSummary, type Extraction, type MeetingSummary } from "../src/index.js";

// Real Qwen3.5-9B answers on an AMI fixture. After a prompt or schema change these
// stop matching: re-record with eval/run-batch.sh and copy the recording here.
const transcript = parseTranscript(readFileSync(new URL("../../../phase0/fixtures/summary/ES2016b.transcript.txt", import.meta.url), "utf8"));
const recording = JSON.parse(readFileSync(new URL("./fixtures/ES2016b.recording.json", import.meta.url), "utf8")) as Recording;
const llm = new ReplayLlm(recording);

describe("recorded run on ES2016b", () => {
  let extraction: Extraction;
  let brief: MeetingSummary;
  let full: MeetingSummary;

  beforeAll(async () => {
    extraction = await extractItems(transcript, llm);
    brief = await writeSummary(extraction, llm, "brief");
    full = await writeSummary(extraction, llm, "full");
  });

  it("links every item to a real line at that time", () => {
    const items = [...extraction.actions, ...extraction.decisions, ...extraction.impacts, ...extraction.openQuestions];
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      expect(transcript.lines[item.evidence.lineIndex]!.startSec).toBe(item.evidence.timestampSec);
    }
  });

  it("finds what the reference asks for, from both passes", () => {
    const decisions = extraction.decisions.map((item) => item.text).join("\n");
    expect(decisions).toMatch(/teletext/i);
    expect(decisions).toMatch(/slogan.*bottom/i);
    expect(decisions).toMatch(/scroll/i);
    expect(extraction.actions.map((item) => item.text).join("\n")).toMatch(/two-piece/i);
  });

  it("lets only the first pass call something decided", () => {
    const coverageOnly = extraction.decisions.filter((item) => item.pass !== "primary" && item.alsoAt.length === 0);
    expect(coverageOnly.length).toBeGreaterThan(0);
    expect(coverageOnly.some((item) => item.status === "Decided")).toBe(false);
  });

  it("gives both lengths the same complete tables", () => {
    expect(brief.body.length).toBe("brief");
    expect(full.body.length).toBe("full");
    expect(brief.actions).toEqual(full.actions);
    expect(brief.decisions).toEqual(full.decisions);
    if (brief.body.length === "brief") expect(brief.body.paragraphs.length).toBeLessThanOrEqual(3);
    expect(renderMarkdown(brief)).toContain("## Decisions");
  });

  it("goes outdated once a line is corrected", () => {
    expect(isOutdated(brief, transcript)).toBe(false);
    const lines = transcript.lines.map((line, index) => (index === 5 ? { ...line, text: `${line.text} (corrected)` } : line));
    expect(isOutdated(brief, { lines })).toBe(true);
  });
});
