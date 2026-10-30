import { contentTokens, jaccard } from "./text.js";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  schema: object;
  maxTokens: number;
  /** Sampling overrides for a retry; absent means greedy. */
  sampling?: Record<string, number>;
  signal?: AbortSignal;
}

export interface LlmResponse {
  content: string;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
}

/** What the pipeline needs from a model; the worker and test replays both provide it. */
export interface LlmClient {
  readonly modelName: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export type LoopVerdict =
  | { ok: true; value: unknown }
  | { ok: false; reason: "token_limit" | "invalid_json" | "repetition" };

const REPEATS_FOR_LOOP = 3;

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === "object") {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") into.push(text);
    else for (const item of Object.values(value)) collectStrings(item, into);
  }
}

/**
 * Greedy decoding on a local model can repeat itself: to the token limit, or,
 * with a grammar and a list cap, as the same item rephrased until the cap.
 */
export function checkOutput(response: LlmResponse): LoopVerdict {
  if (response.finishReason === "length") return { ok: false, reason: "token_limit" };
  let value: unknown;
  try {
    value = JSON.parse(response.content);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const texts: string[] = [];
  collectStrings(value, texts);
  const tokens = texts.map(contentTokens).filter((set) => set.size > 0);
  for (let i = 0; i < tokens.length; i += 1) {
    let repeats = 1;
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (jaccard(tokens[i]!, tokens[j]!) >= 0.9) repeats += 1;
    }
    if (repeats >= REPEATS_FOR_LOOP) return { ok: false, reason: "repetition" };
  }
  return { ok: true, value };
}

/** DRY only acts when sampling, so the retry raises temperature as well. */
export const RETRY_SAMPLING = {
  temperature: 0.4,
  seed: 1,
  dry_multiplier: 0.8,
  dry_base: 1.75,
  dry_allowed_length: 4,
};

export interface StructuredResult {
  value: unknown | null;
  failure: string | null;
  attempts: number;
  promptTokens: number;
  completionTokens: number;
}

/** One schema-constrained call with one sampled retry. */
export async function completeStructured(llm: LlmClient, request: LlmRequest): Promise<StructuredResult> {
  const result: StructuredResult = { value: null, failure: null, attempts: 0, promptTokens: 0, completionTokens: 0 };
  for (const sampling of [undefined, RETRY_SAMPLING]) {
    const response = await llm.complete({ ...request, sampling });
    result.attempts += 1;
    result.promptTokens += response.promptTokens;
    result.completionTokens += response.completionTokens;
    const verdict = checkOutput(response);
    if (verdict.ok) {
      result.value = verdict.value;
      result.failure = null;
      return result;
    }
    result.failure = verdict.reason;
  }
  return result;
}
