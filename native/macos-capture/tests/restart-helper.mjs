// Usage: node restart-helper.mjs <helper> <compiled transcription> <invented audio> <scratch>
// Real helper PCM enters a real supervisor/dispatcher with an empty-VAD host; model inference is not under test.
import assert from 'node:assert/strict';
import { clearTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const [helper, compiled, tone, work] = process.argv.slice(2).map((p) => resolve(p));
const { LiveAudioWorker } = await import(pathToFileURL(join(compiled, 'liveAudioWorker.js')).href);
const { PcmFrameDecoder } = await import(pathToFileURL(join(compiled, 'livePcmProtocol.js')).href);
const { toolsIn } = await import(pathToFileURL(join(compiled, 'config.js')).href);
await mkdir(work, { recursive: true });
async function checksums() {
  const result = {};
  for (const track of ['microphone', 'meeting']) {
    const folder = join(work, 'audio', track);
    for (const file of await readdir(folder)) {
      if (file.endsWith('.opus'))
        result[`${track}/${file}`] = createHash('sha256')
          .update(await readFile(join(folder, file)))
          .digest('hex');
    }
  }
  return result;
}
async function start(origin) {
  const events = [];
  const worker = await LiveAudioWorker.start({
    tools: toolsIn('unused'),
    models: {
      speechLive: 'unused',
      speechFinal: 'unused',
      vad: 'unused',
      segmentation: 'unused',
      embedding: 'unused',
    },
    startModels: async () => ({ port: 1, detect: async () => [], close: async () => undefined }),
    onEvent: (event) => events.push(event),
  });
  await delay(300);
  const child = spawn(helper, [], {
    env: { ...process.env, SCRB_LIVE_FD: '3' },
    stdio: ['pipe', 'pipe', 'inherit', 'pipe'],
  });
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  );
  let refused = 0;
  const frames = [];
  const decoder = new PcmFrameDecoder((frame) => {
    frames.push(frame);
    if (!worker.offer(frame)) refused++;
  });
  child.stdio[3].on('data', (bytes) => decoder.write(bytes));
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const m = JSON.parse(line);
    if (m.type === 'ack') pending.get(m.id)?.(m);
  });
  let id = 0;
  async function send(name, extra = {}) {
    const commandId = String(++id);
    const ack = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${name} acknowledgement`)), 5000);
      pending.set(commandId, (m) => {
        clearTimeout(timer);
        pending.delete(commandId);
        resolve(m);
      });
    });
    child.stdin.write(JSON.stringify({ id: commandId, name, ...extra }) + '\n');
    const m = await ack;
    assert.equal(m.ok, true);
    return m;
  }
  const open = { sessionId: 'restart-test', outputDir: work, source: [], mic: 'default' };
  if (origin !== undefined) open.clockOriginNs = origin;
  await send('open', open);
  const started = await send('start');
  return {
    child,
    worker,
    frames,
    events,
    started,
    send,
    exited,
    refused: () => refused,
    close: () => {
      lines.close();
      child.stdio[3].destroy();
    },
  };
}
const player = spawn('afplay', [tone], { stdio: 'ignore' });
let run;
try {
  run = await start();
  await delay(5600);
  const saved = await checksums();
  assert.ok(Object.keys(saved).length >= 2, 'completed durable chunks before crash');
  const first = run.frames[0];
  assert.ok(first);
  const origin = run.started.clockOriginNs;
  assert.equal(run.refused(), 0);
  run.child.kill('SIGKILL');
  await run.exited;
  await run.worker.close();
  assert.equal(run.worker.offer(first), false, 'old live session is closed');
  run.close();
  run = await start(origin);
  await delay(2600);
  await run.send('stop');
  assert.deepEqual(await run.exited, { code: 0, signal: null });
  await delay(100);
  await run.worker.close();
  const after = await checksums();
  for (const [file, hash] of Object.entries(saved))
    assert.equal(after[file], hash, 'restart preserves saved chunk checksum');
  assert.equal(run.frames[0].sequence, 0, 'helper resets live sequence');
  assert.equal(run.frames[0].generation, 0, 'helper resets live generation');
  assert.equal(run.refused(), 0, 'fresh supervisor accepts reset state');
  assert.ok(!run.events.some((event) => event.type === 'failed'));
  console.log(
    JSON.stringify({
      result: 'PASS',
      savedChunksPreserved: Object.keys(saved).length,
      restartedWireFrames: run.frames.length,
      refused: run.refused(),
      firstSequence: run.frames[0].sequence,
      firstGeneration: run.frames[0].generation,
    }),
  );
} finally {
  player.kill();
  if (run) {
    run.child.kill();
    await run.worker.close();
    run.close();
  }
}
