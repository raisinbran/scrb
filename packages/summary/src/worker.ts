import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { basename } from "node:path";
import type { LlmClient, LlmRequest, LlmResponse } from "./llm.js";

export interface WorkerOptions {
  serverPath: string;
  modelPath: string;
  contextTokens?: number;
  gpuLayers?: number;
  threads?: number;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  extraArgs?: string[];
}

const LOG_TAIL_CHARS = 4000;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

/**
 * Owns one llama-server process for one summary job. A model takes about 8 GB,
 * so callers start it after Stop and stop it as soon as the job ends. Plain
 * node:http, because fetch gives up waiting for headers after five minutes and
 * llama-server sends none until a long section is finished.
 */
export class LlamaServerWorker implements LlmClient {
  readonly modelName: string;
  private process: ChildProcess | null = null;
  private port = 0;
  private logTail = "";
  private exited: Promise<void> = Promise.resolve();

  constructor(private readonly options: WorkerOptions) {
    this.modelName = basename(options.modelPath).replace(/\.gguf$/, "");
  }

  get pid(): number | undefined {
    return this.process?.pid;
  }

  async start(): Promise<void> {
    if (this.process) return;
    this.port = await freePort();
    const { contextTokens = 24576, gpuLayers = 99, threads = 4, extraArgs = [] } = this.options;
    const child = spawn(
      this.options.serverPath,
      ["-m", this.options.modelPath, "-c", String(contextTokens), "-ngl", String(gpuLayers), "-t", String(threads),
        "-fa", "on", "-ctk", "q8_0", "-ctv", "q8_0", "-np", "1", "--host", "127.0.0.1", "--port", String(this.port), ...extraArgs],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const keepTail = (chunk: Buffer) => {
      this.logTail = (this.logTail + chunk.toString()).slice(-LOG_TAIL_CHARS);
    };
    child.stdout.on("data", keepTail);
    child.stderr.on("data", keepTail);
    this.exited = new Promise((resolve) => {
      child.once("exit", () => {
        if (this.process === child) this.process = null;
        resolve();
      });
      child.once("error", (error) => {
        this.logTail += `\n${String(error)}`;
        if (this.process === child) this.process = null;
        resolve();
      });
    });
    this.process = child;
    try {
      await this.waitReady();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private async waitReady(): Promise<void> {
    const deadline = Date.now() + (this.options.startupTimeoutMs ?? 300_000);
    while (Date.now() < deadline) {
      if (!this.process) throw new Error(`llama-server exited during startup: ${this.logTail}`);
      if ((await this.http("GET", "/health", undefined, 2000).catch(() => null))?.status === 200) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("llama-server did not become ready in time");
  }

  async stop(): Promise<void> {
    const child = this.process;
    if (!child) return;
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await this.exited;
    clearTimeout(timer);
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    // A crash between requests costs a reload, not the whole job.
    if (!this.process) await this.start();
    const body = {
      messages: request.messages,
      temperature: 0,
      max_tokens: request.maxTokens,
      response_format: { type: "json_schema", json_schema: { name: "notes", schema: request.schema } },
      // Qwen spends the token budget on reasoning unless this is off.
      chat_template_kwargs: { enable_thinking: false },
      ...request.sampling,
    };
    const response = await this.http(
      "POST",
      "/v1/chat/completions",
      JSON.stringify(body),
      this.options.requestTimeoutMs ?? 1_800_000,
      request.signal,
    );
    if (response.status !== 200) {
      throw new Error(`llama-server returned ${response.status}: ${response.body.slice(0, 500)}`);
    }
    const parsed = JSON.parse(response.body) as {
      choices: { message: { content: string | null }; finish_reason: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = parsed.choices[0];
    if (!choice) throw new Error("llama-server returned no choices");
    return {
      content: choice.message.content ?? "",
      finishReason: choice.finish_reason,
      promptTokens: parsed.usage?.prompt_tokens ?? 0,
      completionTokens: parsed.usage?.completion_tokens ?? 0,
    };
  }

  private http(
    method: string,
    path: string,
    body: string | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const headers = body === undefined ? undefined : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) };
      const req = httpRequest({ host: "127.0.0.1", port: this.port, method, path, headers, signal }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
        res.on("error", reject);
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`llama-server request timed out after ${timeoutMs} ms`)));
      req.on("error", reject);
      req.end(body);
    });
  }
}
