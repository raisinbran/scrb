import { createHash } from "node:crypto";
import type { LlmClient, LlmRequest, LlmResponse } from "../src/llm.js";

export interface Recording {
  [key: string]: LlmResponse;
}

export function requestKey(request: LlmRequest): string {
  const { messages, schema, maxTokens, sampling } = request;
  return createHash("sha256").update(JSON.stringify({ messages, schema, maxTokens, sampling })).digest("hex").slice(0, 16);
}

export class RecordingLlm implements LlmClient {
  readonly recording: Recording = {};
  readonly modelName: string;

  constructor(private readonly inner: LlmClient) {
    this.modelName = inner.modelName;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.inner.complete(request);
    this.recording[requestKey(request)] = response;
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
