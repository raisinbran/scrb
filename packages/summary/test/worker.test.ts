import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LlamaServerWorker } from "../src/worker.js";

const server = fileURLToPath(new URL("./fixtures/fake-llama-server.mjs", import.meta.url));
const request = { messages: [{ role: "user" as const, content: "hi" }], schema: { type: "object" }, maxTokens: 10 };
let worker = new LlamaServerWorker({ serverPath: server, modelPath: "m.gguf" });

afterEach(async () => {
  await worker.stop();
  delete process.env.FAKE_MODE;
});

// The fake server is a Node script, which Windows cannot start directly as an executable.
describe.skipIf(process.platform === "win32")("LlamaServerWorker", () => {
  it("starts the server with Metal offload and a schema request", async () => {
    worker = new LlamaServerWorker({ serverPath: server, modelPath: "/models/Qwen3.5-9B-Q4_K_M.gguf" });
    await worker.start();
    const response = await worker.complete(request);
    const { echo, args } = JSON.parse(response.content);
    expect(args).toEqual(expect.arrayContaining(["-ngl", "99", "-m", "/models/Qwen3.5-9B-Q4_K_M.gguf"]));
    expect(echo.temperature).toBe(0);
    expect(echo.response_format.json_schema.schema).toEqual({ type: "object" });
    expect(echo.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(response).toMatchObject({ promptTokens: 7, completionTokens: 3, finishReason: "stop" });
    expect(worker.modelName).toBe("Qwen3.5-9B-Q4_K_M");
  });

  it("merges sampling overrides into the request", async () => {
    worker = new LlamaServerWorker({ serverPath: server, modelPath: "m.gguf" });
    const response = await worker.complete({ ...request, sampling: { temperature: 0.4, dry_multiplier: 0.8 } });
    expect(JSON.parse(response.content).echo).toMatchObject({ temperature: 0.4, dry_multiplier: 0.8 });
  });

  it("reports a server that dies on startup", async () => {
    process.env.FAKE_MODE = "die";
    worker = new LlamaServerWorker({ serverPath: server, modelPath: "m.gguf" });
    await expect(worker.start()).rejects.toThrow(/exited during startup/);
  });

  it("reports a binary that cannot be started", async () => {
    worker = new LlamaServerWorker({ serverPath: "/no/such/llama-server", modelPath: "m.gguf" });
    await expect(worker.start()).rejects.toThrow(/exited during startup/);
  });

  it("restarts after a crash between requests", async () => {
    process.env.FAKE_MODE = "crash-after-one";
    worker = new LlamaServerWorker({ serverPath: server, modelPath: "m.gguf" });
    await worker.complete(request);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(worker.pid).toBeUndefined();
    await expect(worker.complete(request)).resolves.toMatchObject({ finishReason: "stop" });
  });

  it("leaves no server behind when the parent process exits", async () => {
    const script = `
      import { LlamaServerWorker } from ${JSON.stringify(new URL("../dist/src/worker.js", import.meta.url).href)};
      const worker = new LlamaServerWorker({ serverPath: ${JSON.stringify(server)}, modelPath: "m.gguf" });
      await worker.start();
      console.log(worker.pid);
      process.exit(0);`;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script]).toString();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(() => process.kill(Number(output.trim()), 0)).toThrow();
  });

  it("stops the process", async () => {
    worker = new LlamaServerWorker({ serverPath: server, modelPath: "m.gguf" });
    await worker.start();
    const pid = worker.pid!;
    await worker.stop();
    expect(worker.pid).toBeUndefined();
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
