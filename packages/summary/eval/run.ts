/**
 * Runs the pipeline on one fixture meeting and saves everything a judge needs.
 *
 * Usage (always one meeting per process, so the model lock is released between meetings):
 *   lockf -k ~/.local/share/scrb-node/model.lock taskpolicy -c utility \
 *     node dist/eval/run.js <fixtures_dir> <out_dir> <meeting> [--no-coverage] [--section-chars N] [--coverage-chars N]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractItems, LlamaServerWorker, renderMarkdown, writeSummary } from "../src/index.js";
import { formatStamp } from "../src/time.js";
import type { Extraction, SummaryItem } from "../src/types.js";
import { parseTranscript } from "./fixture.js";
import { RecordingLlm } from "./record.js";

const PHASE0 = process.env.SCRB_PHASE0 ?? join(homedir(), "Documents/GitHub/scrb/phase0");

function arg(args: string[], name: string, fallback: number): number {
  const at = args.indexOf(name);
  return at === -1 ? fallback : Number(args[at + 1]);
}

function line(item: SummaryItem): string {
  const extra =
    item.kind === "action" ? ` [owner ${item.owner}; ${item.deadline}; ${item.status}]`
    : item.kind === "decision" ? ` [${item.status}; ${item.impactArea}]`
    : item.kind === "impact" ? ` [${item.basis}]` : "";
  const flags = item.flags.length ? ` {${item.flags.join(",")}}` : "";
  return `${formatStamp(item.evidence.timestampSec)} (${item.pass}) ${item.text}${extra}${flags}`;
}

function judgingSheet(meeting: string, extraction: Extraction, reference: { actions: string[]; decisions: string[] }): string {
  const out = [`# ${meeting}`, "", "## Reference actions", ...reference.actions.map((t) => `- ${t}`), "", "## Reference decisions", ...reference.decisions.map((t) => `- ${t}`)];
  for (const [title, items] of [["Actions", extraction.actions], ["Decisions", extraction.decisions], ["Impacts", extraction.impacts], ["Open questions", extraction.openQuestions]] as const) {
    out.push("", `## Output: ${title}`, ...items.map((item) => `- ${line(item)}`));
  }
  out.push("", "## Rejected", ...extraction.rejected.map((r) => `- ${r.kind} ${r.timestamp} (${r.pass}): ${r.text} <- ${r.reason}`));
  if (extraction.warnings.length) out.push("", "## Warnings", ...extraction.warnings);
  return `${out.join("\n")}\n`;
}

function rssMib(pid: number | undefined): number {
  if (!pid) return 0;
  try {
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString().trim()) / 1024;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const [fixtures, out, meeting, ...rest] = process.argv.slice(2);
  if (!fixtures || !out || !meeting) throw new Error("usage: run.js <fixtures_dir> <out_dir> <meeting>");
  mkdirSync(out, { recursive: true });
  const transcript = parseTranscript(readFileSync(join(fixtures, `${meeting}.transcript.txt`), "utf8"));
  const reference = JSON.parse(readFileSync(join(fixtures, `${meeting}.reference.json`), "utf8")) as { actions: string[]; decisions: string[] };
  const worker = new LlamaServerWorker({
    serverPath: join(PHASE0, "upstream/llama.cpp/build/bin/llama-server"),
    modelPath: join(PHASE0, "models/llm/Qwen3.5-9B-Q4_K_M.gguf"),
  });
  const llm = new RecordingLlm(worker, join(out, `${meeting}.recording.json`));
  let peakRss = 0;
  const sampler = setInterval(() => (peakRss = Math.max(peakRss, rssMib(worker.pid))), 3000);
  try {
    const extractStart = Date.now();
    const extraction = await extractItems(transcript, llm, {
      sectionChars: arg(rest, "--section-chars", 16000),
      coverageChars: rest.includes("--no-coverage") ? 0 : arg(rest, "--coverage-chars", 6000),
      onProgress: (done, total) => console.error(`${meeting}: ${done}/${total}`),
    });
    const extractSeconds = (Date.now() - extractStart) / 1000;
    const narrativeStart = Date.now();
    const brief = await writeSummary(extraction, llm, "brief");
    const full = await writeSummary(extraction, llm, "full");
    const narrativeSeconds = (Date.now() - narrativeStart) / 1000;
    writeFileSync(join(out, `${meeting}.extraction.json`), JSON.stringify(extraction, null, 1));
    writeFileSync(join(out, `${meeting}.judging.md`), judgingSheet(meeting, extraction, reference));
    writeFileSync(join(out, `${meeting}.brief.md`), renderMarkdown(brief));
    writeFileSync(join(out, `${meeting}.full.md`), renderMarkdown(full));
    const row = {
      meeting, extractSeconds, narrativeSeconds, peakRssMib: Math.round(peakRss), ...extraction.stats,
      actions: extraction.actions.length, decisions: extraction.decisions.length, impacts: extraction.impacts.length,
      openQuestions: extraction.openQuestions.length, rejected: extraction.rejected.length,
      flagged: [...extraction.actions, ...extraction.decisions].filter((item) => item.flags.length > 0).length,
      warnings: extraction.warnings.length,
    };
    writeFileSync(join(out, `${meeting}.row.json`), JSON.stringify(row, null, 1));
    console.log(JSON.stringify(row));
  } finally {
    clearInterval(sampler);
    await worker.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
