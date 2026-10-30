import { flagConflicts, dedupe } from "./dedupe.js";
import { resolveEvidence } from "./evidence.js";
import { nonItemReason } from "./filter.js";
import { completeStructured, type LlmClient } from "./llm.js";
import { transcriptHash } from "./outdated.js";
import { COVERAGE_FOCI, coverageSystem, primarySystem } from "./prompts.js";
import { ACTIONS_ONLY_SCHEMA, DECISIONS_ONLY_SCHEMA, EXTRACTION_SCHEMA } from "./schema.js";
import { sectionOf, splitSections, type Section } from "./sections.js";
import { words } from "./text.js";
import { formatStamp } from "./time.js";
import type {
  ActionItem,
  ActionStatus,
  DecisionItem,
  DecisionStatus,
  Extraction,
  ExtractionStats,
  ImpactArea,
  ImpactBasis,
  ImpactItem,
  ItemFlag,
  ItemKind,
  OpenQuestionItem,
  RejectedItem,
  SummaryItem,
  Transcript,
} from "./types.js";
import { NOT_SPECIFIED, UNCONFIRMED } from "./types.js";

export interface ExtractOptions {
  /** Section size for the first pass; about 6k tokens, well inside the context. */
  sectionChars?: number;
  overlapChars?: number;
  /** Window size for the coverage pass; 0 turns the pass off. */
  coverageChars?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

const DEFAULTS = { sectionChars: 16000, overlapChars: 600, coverageChars: 6000, maxTokens: 4096 };
/** A section that keeps failing is halved this many times before it is reported lost. */
const MAX_SPLIT_DEPTH = 2;

interface RawItem {
  text?: string;
  owner?: string;
  deadline?: string;
  status?: string;
  impact_area?: string;
  basis?: string;
  timestamp?: string;
  quote?: string;
}

interface Raw {
  gist?: string;
  action_items?: RawItem[];
  decisions?: RawItem[];
  impacts?: RawItem[];
  open_questions?: RawItem[];
}

const UNKNOWN = /^(|n\/?a|none|unknown|unclear|unspecified|not (specified|stated|clear|mentioned|given)|tbd)\.?$/i;
const COLLECTIVE = /^(the )?(team|group|everyone|everybody|all|all members|team members)$/i;

const AREAS: Record<string, ImpactArea> = {
  scope: "Scope",
  schedule: "Schedule",
  cost: "Cost",
  risk: "Risk",
  deliverables: "Deliverables",
  "technical approach": "Technical approach",
};

function capitalised<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option.toLowerCase() === value?.toLowerCase()) ?? fallback;
}

function checkOwner(owner: string | undefined, speakers: Set<string>, sectionWords: Set<string>): { owner: string; flag?: ItemFlag } {
  const value = owner?.trim() ?? "";
  if (UNKNOWN.test(value)) return { owner: NOT_SPECIFIED };
  if (speakers.has(value.toLowerCase())) return { owner: value };
  if (COLLECTIVE.test(value)) return { owner: "Everyone" };
  // A name or role the model read must be in the section; otherwise it was invented.
  const parts = words(value);
  if (parts.length > 0 && parts.every((part) => sectionWords.has(part))) return { owner: value };
  return { owner: UNCONFIRMED, flag: "owner_unconfirmed" };
}

function checkDeadline(deadline: string | undefined, sectionWords: Set<string>): { deadline: string; flag?: ItemFlag } {
  const value = deadline?.trim() ?? "";
  if (UNKNOWN.test(value)) return { deadline: NOT_SPECIFIED };
  if (words(value).every((part) => sectionWords.has(part))) return { deadline: value };
  return { deadline: UNCONFIRMED, flag: "deadline_unconfirmed" };
}

class Extractor {
  readonly stats: ExtractionStats = { sections: 0, requests: 0, retries: 0, splits: 0, promptTokens: 0, completionTokens: 0 };
  readonly items: SummaryItem[] = [];
  readonly rejected: RejectedItem[] = [];
  readonly warnings: string[] = [];
  readonly gists = new Map<number, string>();
  private nextId = 1;
  private readonly speakerNames: string[];
  private readonly speakers: Set<string>;

  constructor(
    private readonly transcript: Transcript,
    private readonly llm: LlmClient,
    private readonly options: typeof DEFAULTS & ExtractOptions,
  ) {
    this.speakerNames = [...new Set(transcript.lines.map((line) => line.speaker))];
    this.speakers = new Set(this.speakerNames.map((name) => name.toLowerCase()));
  }

  /** Reads one section, halving it when the model cannot finish it. */
  async read(section: Section, system: string, schema: object, pass: string, depth = 0): Promise<void> {
    const result = await completeStructured(this.llm, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: section.text },
      ],
      schema,
      maxTokens: this.options.maxTokens,
      signal: this.options.signal,
    });
    this.stats.requests += result.attempts;
    this.stats.retries += result.attempts - 1;
    this.stats.promptTokens += result.promptTokens;
    this.stats.completionTokens += result.completionTokens;
    if (result.value !== null) {
      this.collect(result.value as Raw, section, pass);
      return;
    }
    const middle = Math.floor((section.start + section.end) / 2);
    if (depth >= MAX_SPLIT_DEPTH || section.end - section.start < 8) {
      const lines = this.transcript.lines;
      this.warnings.push(
        `Could not read ${formatStamp(lines[section.start]!.startSec)}–${formatStamp(lines[section.end - 1]!.startSec)} ` +
          `in ${pass} (${result.failure}); items from this part may be missing.`,
      );
      return;
    }
    this.stats.splits += 1;
    await this.read(sectionOf(this.transcript.lines, section.start, middle), system, schema, pass, depth + 1);
    await this.read(sectionOf(this.transcript.lines, middle, section.end), system, schema, pass, depth + 1);
  }

  private collect(raw: Raw, section: Section, pass: string): void {
    if (raw.gist) this.gists.set(section.start, raw.gist.trim());
    const lines = this.transcript.lines;
    const sectionWords = new Set(words(lines.slice(section.start, section.end).map((line) => line.text).join(" ")));
    for (const entry of raw.action_items ?? []) this.add("action", entry, section, pass, sectionWords);
    for (const entry of raw.decisions ?? []) this.add("decision", entry, section, pass, sectionWords);
    for (const entry of raw.impacts ?? []) this.add("impact", entry, section, pass, sectionWords);
    for (const entry of raw.open_questions ?? []) this.add("openQuestion", entry, section, pass, sectionWords);
  }

  private add(kind: ItemKind, entry: RawItem, section: Section, pass: string, sectionWords: Set<string>): void {
    const text = entry.text?.trim() ?? "";
    const timestamp = entry.timestamp ?? "";
    const reject = (reason: string) => this.rejected.push({ kind, text, timestamp, pass, reason });
    const filtered = nonItemReason(text);
    if (filtered) return void reject(`non-item: ${filtered}`);
    const evidence = resolveEvidence({ text, timestamp, quote: entry.quote ?? "" }, this.transcript.lines, section);
    if (!evidence.ok) return void reject(evidence.reason);
    const base = { id: "", text, evidence: evidence.link, alsoAt: [], flags: evidence.flags, pass };
    const impactArea = AREAS[entry.impact_area?.toLowerCase() ?? ""] ?? NOT_SPECIFIED;
    if (kind === "action") {
      const owner = checkOwner(entry.owner, this.speakers, sectionWords);
      const deadline = checkDeadline(entry.deadline, sectionWords);
      if (owner.flag) base.flags.push(owner.flag);
      if (deadline.flag) base.flags.push(deadline.flag);
      const status = capitalised<ActionStatus>(entry.status, ["Agreed", "Proposed", "Unconfirmed"], "Unconfirmed");
      this.items.push({ ...base, kind, owner: owner.owner, deadline: deadline.deadline, status });
    } else if (kind === "decision") {
      const status = capitalised<DecisionStatus>(entry.status, ["Decided", "Proposed", "Tentatively agreed", "Unresolved"], "Unresolved");
      this.items.push({ ...base, kind, status, impactArea });
    } else if (kind === "impact") {
      // Anything not plainly marked as stated counts as inferred.
      const basis: ImpactBasis = entry.basis?.toLowerCase() === "stated" ? "Stated" : "Inferred";
      this.items.push({ ...base, kind, impactArea, basis });
    } else {
      this.items.push({ ...base, kind });
    }
  }

  finish(): Extraction {
    const merged = dedupe(this.items).sort((a, b) => a.evidence.timestampSec - b.evidence.timestampSec);
    flagConflicts(merged.filter((item) => item.kind === "decision"));
    for (const item of merged) {
      item.id = `${item.kind}-${this.nextId}`;
      this.nextId += 1;
    }
    return {
      sourceHash: transcriptHash(this.transcript),
      actions: merged.filter((item): item is ActionItem => item.kind === "action"),
      decisions: merged.filter((item): item is DecisionItem => item.kind === "decision"),
      impacts: merged.filter((item): item is ImpactItem => item.kind === "impact"),
      openQuestions: merged.filter((item): item is OpenQuestionItem => item.kind === "openQuestion"),
      gists: [...this.gists.entries()].sort((a, b) => a[0] - b[0]).map(([, gist]) => gist),
      rejected: this.rejected,
      warnings: this.warnings,
      stats: this.stats,
    };
  }

  get speakerList(): string[] {
    return this.speakerNames;
  }
}

/** Step one of a summary: everything the tables need, each item tied to a line. */
export async function extractItems(transcript: Transcript, llm: LlmClient, options: ExtractOptions = {}): Promise<Extraction> {
  const settings = { ...DEFAULTS, ...options };
  const extractor = new Extractor(transcript, llm, settings);
  const sections = splitSections(transcript.lines, settings.sectionChars, settings.overlapChars);
  const windows = settings.coverageChars > 0 ? splitSections(transcript.lines, settings.coverageChars, settings.overlapChars) : [];
  const total = sections.length + windows.length * COVERAGE_FOCI.length;
  let done = 0;
  const step = () => {
    done += 1;
    settings.onProgress?.(done, total);
  };
  extractor.stats.sections = sections.length;

  const primary = primarySystem(extractor.speakerList);
  for (const section of sections) {
    await extractor.read(section, primary, EXTRACTION_SCHEMA, "primary");
    step();
  }
  for (const focus of COVERAGE_FOCI) {
    const schema = focus.schemaKey === "action_items" ? ACTIONS_ONLY_SCHEMA : DECISIONS_ONLY_SCHEMA;
    const system = coverageSystem(focus, extractor.speakerList);
    for (const window of windows) {
      await extractor.read(window, system, schema, focus.name);
      step();
    }
  }
  return extractor.finish();
}

