import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { LlmClient, LlmRequest, LlmResponse } from "../src/llm.js";

export interface Recording {
  [key: string]: LlmResponse;
}

export function requestKey(request: LlmRequest): string {
  const { messages, schema, maxTokens, sampling } = request;
  return createHash("sha256").update(JSON.stringify({ messages, schema, maxTokens, sampling })).digest("hex").slice(0, 16);
}

/** Saves after every answer and reuses saved answers, so an interrupted run resumes. */
export class RecordingLlm implements LlmClient {
  readonly recording: Recording;
  readonly modelName: string;

  constructor(private readonly inner: LlmClient, private readonly path: string) {
    this.modelName = inner.modelName;
    this.recording = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Recording) : {};
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const key = requestKey(request);
    const saved = this.recording[key];
    if (saved) return saved;
    const response = await this.inner.complete(request);
    this.recording[key] = response;
    writeFileSync(this.path, JSON.stringify(this.recording));
    return response;
  }
}

/** Plays a recording back; a prompt change shows up as a clean failure, not a silent pass. */
export class ReplayLlm implements LlmClient {
  readonly modelName = "replay";

  constructor(private readonly recording: Recording) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = this.recording[requestKey(request)];
    if (!response) throw new Error(`no recorded response for ${requestKey(request)}`);
    return response;
  }
}
