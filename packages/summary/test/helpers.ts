import type { LlmClient, LlmRequest, LlmResponse } from "../src/llm.js";
import type { Transcript } from "../src/types.js";

export const transcript: Transcript = {
  lines: [
    { startSec: 10, speaker: "A", text: "Welcome everyone, let's start with the budget." },
    { startSec: 20, speaker: "B", text: "The supplier raised the battery price by ten percent." },
    { startSec: 30, speaker: "A", text: "Then we drop the aluminium case and use plastic." },
    { startSec: 40, speaker: "C", text: "Fine by me." },
    { startSec: 1800, speaker: "B", text: "I will send the new quote to finance by Friday." },
    { startSec: 1810, speaker: "A", text: "Who approves the extra tooling cost?" },
  ],
};

export function respond(value: unknown, finishReason = "stop"): LlmResponse {
  return { content: typeof value === "string" ? value : JSON.stringify(value), finishReason, promptTokens: 10, completionTokens: 5 };
}

/** Answers from a script, in order, and keeps the requests for inspection. */
export class ScriptedLlm implements LlmClient {
  readonly modelName = "scripted";
  readonly requests: LlmRequest[] = [];

  constructor(private readonly answers: (LlmResponse | ((request: LlmRequest) => LlmResponse))[]) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    const answer = this.answers[Math.min(this.requests.length, this.answers.length) - 1];
    if (!answer) throw new Error("script is empty");
    return typeof answer === "function" ? answer(request) : answer;
  }
}

export const empty = { gist: "", action_items: [], decisions: [], impacts: [], open_questions: [] };
