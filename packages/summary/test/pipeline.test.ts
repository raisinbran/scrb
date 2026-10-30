import { describe, expect, it } from "vitest";
import { extractItems, renderMarkdown, writeSummary } from "../src/index.js";
import { empty, respond, ScriptedLlm, transcript } from "./helpers.js";

const noCoverage = { coverageChars: 0 };

const good = {
  gist: "Budget pressure and a material change.",
  action_items: [
    { text: "Send the new quote to finance", owner: "B", deadline: "Friday", status: "agreed", timestamp: "30:00", quote: "send the new quote to finance" },
    { text: "Approve the tooling cost", owner: "Morgan", deadline: "next Tuesday", status: "proposed", timestamp: "30:10", quote: "approves the extra tooling cost" },
  ],
  decisions: [
    { text: "Use a plastic case instead of aluminium", status: "decided", impact_area: "cost", timestamp: "00:30", quote: "drop the aluminium case" },
    { text: "Invented decision to move the launch", status: "decided", impact_area: "schedule", timestamp: "50:00", quote: "launch moved" },
  ],
  impacts: [{ text: "Battery cost rises ten percent", impact_area: "cost", basis: "stated", timestamp: "00:20", quote: "raised the battery price" }],
  open_questions: [{ text: "Who approves the extra tooling cost?", timestamp: "30:10", quote: "who approves" }],
};

describe("extractItems", () => {
  it("keeps supported items, drops the unsupported one, and never keeps an invented owner or date", async () => {
    const result = await extractItems(transcript, new ScriptedLlm([respond(good)]), noCoverage);
    expect(result.actions[0]).toMatchObject({ owner: "B", deadline: "Friday", status: "Agreed", evidence: { timestampSec: 1800 } });
    expect(result.actions[1]).toMatchObject({ owner: "Unconfirmed", deadline: "Unconfirmed", status: "Proposed" });
    expect(result.actions[1]!.flags).toEqual(expect.arrayContaining(["owner_unconfirmed", "deadline_unconfirmed"]));
    expect(result.decisions.map((item) => item.text)).toEqual(["Use a plastic case instead of aluminium"]);
    expect(result.rejected).toMatchObject([{ kind: "decision", reason: expect.stringContaining("50:00") }]);
    expect(result.impacts[0]).toMatchObject({ basis: "Stated", impactArea: "Cost" });
    expect(result.openQuestions).toHaveLength(1);
    expect(result.gists).toEqual([good.gist]);
    expect(result.warnings).toEqual([]);
  });

  it("treats an impact without a clear basis as inferred", async () => {
    const impacts = [{ ...good.impacts[0]!, basis: "maybe" }];
    const result = await extractItems(transcript, new ScriptedLlm([respond({ ...empty, impacts })]), noCoverage);
    expect(result.impacts[0]!.basis).toBe("Inferred");
  });

  it("reads 'Not specified' for missing owner and date", async () => {
    const action = { ...good.action_items[0]!, owner: "unknown", deadline: "" };
    const result = await extractItems(transcript, new ScriptedLlm([respond({ ...empty, action_items: [action] })]), noCoverage);
    expect(result.actions[0]).toMatchObject({ owner: "Not specified", deadline: "Not specified", flags: [] });
  });

  it("retries a loop with sampling", async () => {
    const llm = new ScriptedLlm([respond('{"decisions":[', "length"), respond(good)]);
    const result = await extractItems(transcript, llm, noCoverage);
    expect(llm.requests[0]!.sampling).toBeUndefined();
    expect(llm.requests[1]!.sampling).toMatchObject({ temperature: 0.4, dry_multiplier: 0.8 });
    expect(result.stats).toMatchObject({ retries: 1, requests: 2 });
    expect(result.decisions).toHaveLength(1);
  });

  it("halves a section the retry cannot save", async () => {
    const lines = Array.from({ length: 16 }, (_, i) => ({ startSec: i * 10, speaker: "A", text: `plain line ${i}` }));
    const loop = respond("{", "length");
    const llm = new ScriptedLlm([loop, loop, respond(empty)]);
    const result = await extractItems({ lines }, llm, noCoverage);
    expect(result.stats.splits).toBe(1);
    expect(llm.requests[2]!.messages[1]!.content.split("\n")).toHaveLength(8);
    expect(result.warnings).toEqual([]);
  });

  it("says which part was lost when nothing works", async () => {
    const lines = Array.from({ length: 4 }, (_, i) => ({ startSec: i * 60, speaker: "A", text: `plain line ${i}` }));
    const result = await extractItems({ lines }, new ScriptedLlm([respond("{", "length")]), noCoverage);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("00:00–03:00");
  });

  it("adds what the coverage pass finds and merges what it repeats", async () => {
    const found = { text: "Use a plastic case instead of aluminium, as everyone accepted", status: "decided", impact_area: "cost", timestamp: "00:30", quote: "use plastic" };
    const fresh = { text: "The battery supplier stays the same", status: "decided", impact_area: "cost", timestamp: "00:20", quote: "supplier raised the battery" };
    const llm = new ScriptedLlm([
      respond({ ...empty, decisions: [good.decisions[0]] }),
      respond({ action_items: [] }),
      (request) => respond({ decisions: request.messages[0]!.content.includes("settled") ? [found, fresh] : [] }),
    ]);
    const result = await extractItems(transcript, llm, { coverageChars: 100000 });
    expect(llm.requests).toHaveLength(3);
    expect(result.decisions.map((item) => item.pass).sort()).toEqual(["coverage-settled", "primary"]);
  });

  it("filters procedure before it reaches the tables", async () => {
    const item = { ...good.decisions[0]!, text: "The meeting will be concluded" };
    const result = await extractItems(transcript, new ScriptedLlm([respond({ ...empty, decisions: [item] })]), noCoverage);
    expect(result.decisions).toEqual([]);
    expect(result.rejected[0]!.reason).toContain("non-item");
  });
});

describe("writeSummary", () => {
  const extraction = () => extractItems(transcript, new ScriptedLlm([respond(good)]), noCoverage);

  it("writes a Brief with the tables appended", async () => {
    const summary = await writeSummary(await extraction(), new ScriptedLlm([respond({ paragraphs: ["They changed the case."] })]), "brief");
    const text = renderMarkdown(summary);
    expect(text).toContain("They changed the case.");
    expect(text).toContain("| Send the new quote to finance | B | Friday | Agreed | 30:00 |");
    expect(text).toContain("| Use a plastic case instead of aluminium | Decided | Cost | 00:30 |");
    expect(text).toContain("owner unclear");
  });

  it("writes a Full with sections from the checked items only, and inferred impacts marked", async () => {
    const data = await extraction();
    data.impacts[0]!.basis = "Inferred";
    const llm = new ScriptedLlm([respond({ overview: "Costs rose.", main_topics: [{ title: "Budget", summary: "The case changed." }] })]);
    const text = renderMarkdown(await writeSummary(data, llm, "full"));
    expect(text).toContain("## Critical decisions");
    expect(text).toContain("Possible impact (inferred, not stated): Battery cost rises");
    expect(text).toContain("## Open questions");
    expect(text).toContain("## Action items");
    expect(llm.requests[0]!.messages[1]!.content).not.toContain("Invented decision");
  });

  it("warns about numbers the notes do not contain", async () => {
    const summary = await writeSummary(await extraction(), new ScriptedLlm([respond({ paragraphs: ["The budget grew by 45 percent."] })]), "brief");
    expect(summary.warnings.join(" ")).toContain("45");
  });

  it("falls back to the section notes and keeps the tables when the prose fails", async () => {
    const summary = await writeSummary(await extraction(), new ScriptedLlm([respond("{", "length")]), "brief");
    expect(summary.body).toEqual({ length: "brief", paragraphs: [good.gist] });
    expect(summary.actions).toHaveLength(2);
    expect(summary.warnings.join(" ")).toContain("could not be written");
  });
});
