import { describe, expect, it } from "vitest";
import { dedupe, flagConflicts } from "../src/dedupe.js";
import { resolveEvidence } from "../src/evidence.js";
import { nonItemReason } from "../src/filter.js";
import { checkOutput } from "../src/llm.js";
import { isOutdated, OUTDATED_MESSAGE, transcriptHash } from "../src/outdated.js";
import { sectionOf, splitSections } from "../src/sections.js";
import { formatStamp, parseStamp } from "../src/time.js";
import type { ActionItem, DecisionItem } from "../src/types.js";
import { respond, transcript } from "./helpers.js";

const whole = sectionOf(transcript.lines, 0, transcript.lines.length);
const early = sectionOf(transcript.lines, 0, 4);

describe("timestamps", () => {
  it("round-trips, past 99 minutes too", () => {
    expect(formatStamp(65.9)).toBe("01:05");
    expect(formatStamp(6300)).toBe("105:00");
    expect(parseStamp("105:00")).toBe(6300);
    expect(parseStamp("12:75")).toBeNull();
    expect(parseStamp("noon")).toBeNull();
  });
});

describe("splitSections", () => {
  const lines = Array.from({ length: 200 }, (_, i) => ({ startSec: i * 5, speaker: "A", text: `line number ${i} with some words in it` }));

  it("keeps a short meeting whole", () => {
    expect(splitSections(lines.slice(0, 3), 10000, 100)).toHaveLength(1);
  });

  it("covers every line, overlaps, and stays near the limit", () => {
    const sections = splitSections(lines, 2000, 200);
    expect(sections.length).toBeGreaterThan(2);
    expect(sections[0]!.start).toBe(0);
    expect(sections.at(-1)!.end).toBe(200);
    for (let i = 1; i < sections.length; i += 1) expect(sections[i]!.start).toBeLessThan(sections[i - 1]!.end);
    for (const section of sections) expect(section.text.length).toBeLessThan(2400);
  });

  it("handles an empty transcript", () => {
    expect(splitSections([], 100, 10)).toEqual([]);
  });
});

describe("resolveEvidence", () => {
  const lines = transcript.lines;

  it("accepts a timestamp whose line supports the item", () => {
    const result = resolveEvidence({ text: "Use a plastic case", timestamp: "00:30", quote: "drop the aluminium case" }, lines, whole);
    expect(result).toEqual({ ok: true, link: { lineIndex: 2, timestampSec: 30 }, flags: [] });
  });

  it("repairs a wrong timestamp from a quote in the section, and flags it", () => {
    const result = resolveEvidence({ text: "Send the quote", timestamp: "00:30", quote: "send the new quote to finance" }, lines, whole);
    expect(result).toMatchObject({ ok: true, link: { lineIndex: 4 }, flags: ["timestamp_repaired"] });
  });

  it("drops an item shifted to a line outside its section", () => {
    const result = resolveEvidence({ text: "Send the quote to finance", timestamp: "30:00", quote: "unrelated invented words here" }, lines, early);
    expect(result.ok).toBe(false);
  });

  it("drops a timestamp that matches no line", () => {
    const result = resolveEvidence({ text: "Hire a contractor", timestamp: "12:34", quote: "we should hire somebody" }, lines, whole);
    expect(result.ok).toBe(false);
  });

  it("flags a real timestamp with nothing to support it", () => {
    const result = resolveEvidence({ text: "Hire a contractor", timestamp: "00:40", quote: "we should hire somebody" }, lines, whole);
    expect(result).toMatchObject({ ok: true, flags: ["weak_evidence"] });
  });

  it("snaps a rounding slip to the nearby line", () => {
    const result = resolveEvidence({ text: "Battery price raised ten percent", timestamp: "00:21", quote: "" }, lines, whole);
    expect(result).toMatchObject({ ok: true, link: { lineIndex: 1 }, flags: ["timestamp_repaired"] });
  });
});

describe("nonItemReason", () => {
  it.each([
    "The group will review the minutes.",
    "Make a decision on the remote's functions.",
    "The meeting will be concluded.",
    "Marketing presents first.",
    "Everyone introduced themselves to the team.",
    "A will be the project manager.",
    "The team will discuss the agenda.",
    "Yes.",
  ])("cuts %s", (text) => {
    expect(nonItemReason(text)).not.toBeNull();
  });

  it.each([
    "The project manager will post the minutes.",
    "The remote will have a charging station.",
    "Dana will present the cost analysis at the next meeting.",
    "Marketing will research new trends.",
  ])("keeps %s", (text) => {
    expect(nonItemReason(text)).toBeNull();
  });
});

function action(text: string, owner: string, second: number): ActionItem {
  return { id: "", kind: "action", text, owner, deadline: "Not specified", status: "Agreed", evidence: { lineIndex: 0, timestampSec: second }, alsoAt: [], flags: [], pass: "primary" };
}

function decision(text: string, second = 0): DecisionItem {
  return { id: "", kind: "decision", text, status: "Decided", impactArea: "Scope", evidence: { lineIndex: 0, timestampSec: second }, alsoAt: [], flags: [], pass: "primary" };
}

describe("dedupe", () => {
  it("merges rephrasings and remembers where", () => {
    const kept = dedupe([decision("The remote will have a charging station.", 5), decision("Remote has a charging station", 50)]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.alsoAt).toHaveLength(1);
  });

  it("keeps the same task for two owners", () => {
    expect(dedupe([action("Work on the concept", "B", 1), action("Work on the concept", "C", 2)])).toHaveLength(2);
  });

  it("fills in an owner from the duplicate", () => {
    const kept = dedupe([action("Post the project documents", "Not specified", 1), action("Post the project documents today", "A", 2)]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.owner).toBe("A");
  });

  it("keeps distinct items that share only framing", () => {
    expect(dedupe([decision("The remote will have large buttons."), decision("The remote will have a charging station.")])).toHaveLength(2);
  });

  it("does not merge a decision with its opposite, and flags both", () => {
    const items = dedupe([decision("The remote will include an LCD screen."), decision("The remote will not include an LCD screen.")]);
    expect(items).toHaveLength(2);
    flagConflicts(items);
    expect(items.every((item) => item.flags.includes("conflict"))).toBe(true);
  });
});

describe("checkOutput", () => {
  it("passes good JSON", () => {
    expect(checkOutput(respond({ decisions: [{ text: "Use plastic" }] }))).toMatchObject({ ok: true });
  });

  it("spots a run to the token limit", () => {
    expect(checkOutput(respond('{"decisions":[', "length"))).toEqual({ ok: false, reason: "token_limit" });
  });

  it("spots broken JSON", () => {
    expect(checkOutput(respond("{oops"))).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("spots the same item repeated inside valid JSON", () => {
    const decisions = Array.from({ length: 3 }, () => ({ text: "The remote will be yellow and sponge shaped", quote: "x" }));
    expect(checkOutput(respond({ decisions }))).toEqual({ ok: false, reason: "repetition" });
  });
});

describe("outdated flag", () => {
  const summary = { sourceHash: transcriptHash(transcript) };

  it("is clear while the transcript is unchanged", () => {
    expect(isOutdated(summary, { lines: transcript.lines.map((line) => ({ ...line })) })).toBe(false);
  });

  it.each([
    ["a text correction", { ...transcript.lines[1]!, text: "The supplier raised the battery price by 20%." }],
    ["a speaker rename", { ...transcript.lines[1]!, speaker: "Dana" }],
  ])("is raised by %s", (_name, changed) => {
    const lines = [...transcript.lines];
    lines[1] = changed;
    expect(isOutdated(summary, { lines })).toBe(true);
  });

  it("has the wording from the requirements", () => {
    expect(OUTDATED_MESSAGE).toBe("May be outdated — regenerate?");
  });
});
