#!/usr/bin/env node
// Stands in for llama-server: same flags, /health, /v1/chat/completions.
import { createServer } from "node:http";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
const mode = process.env.FAKE_MODE ?? "ok";
if (mode === "die") process.exit(3);
let served = 0;
createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200).end("{}");
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    served += 1;
    const parsed = JSON.parse(body);
    const payload = {
      choices: [{ message: { content: JSON.stringify({ echo: parsed, args }) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    };
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(payload));
    if (mode === "crash-after-one" && served === 1) setTimeout(() => process.exit(4), 10);
  });
}).listen(port, "127.0.0.1");
process.on("SIGTERM", () => process.exit(0));
