// Usage: node capture-smoke.mjs <helper> <compiled transcription> <invented audio> <scratch>
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
const [helper, compiled, tone, root] = process.argv.slice(2).map((p) => resolve(p));
const { PcmFrameDecoder, pcmEndNs } = await import(
  pathToFileURL(join(compiled, 'livePcmProtocol.js')).href
);
const player = spawn('afplay', [tone], { stdio: 'ignore' });
try {
  for (const mode of ['off', 'read', 'stalled', 'closed']) {
    const work = join(root, mode);
    await mkdir(work, { recursive: true });
    const env = { ...process.env };
    delete env.SCRB_LIVE_FD;
    if (mode !== 'off') env.SCRB_LIVE_FD = '3';
    const child = spawn(helper, [], { env, stdio: ['pipe', 'pipe', 'inherit', 'pipe'] });
    const exited = new Promise((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
    );
    const pending = new Map();
    const events = [];
    const frames = [];
    const decoder = new PcmFrameDecoder((frame) => frames.push(frame));
    let decodeError;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      const m = JSON.parse(line);
      if (m.type === 'ack') pending.get(m.id)?.(m);
      else events.push(m);
    });
    if (mode === 'read')
      child.stdio[3].on('data', (bytes) => {
        try {
          decoder.write(bytes);
        } catch (e) {
          decodeError = e;
        }
      });
    if (mode === 'closed') child.stdio[3].destroy();
    let id = 0;
    async function send(name, extra = {}) {
      const commandId = String(++id);
      const ack = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No ${name} ack in ${mode}`)), 5000);
        pending.set(commandId, (m) => {
          clearTimeout(timer);
          pending.delete(commandId);
          resolve(m);
        });
      });
      child.stdin.write(JSON.stringify({ id: commandId, name, ...extra }) + '\n');
      const result = await ack;
      assert.equal(result.ok, true, `${mode} ${name}`);
      return result;
    }
    try {
      const opened = await send('open', {
        sessionId: 'native-smoke',
        outputDir: work,
        source: [],
        mic: 'default',
      });
      assert.deepEqual([...opened.activeTracks].sort(), ['meeting', 'microphone']);
      await send('start');
      await delay(mode === 'stalled' ? 5000 : 1600);
      let before = performance.now();
      const paused = await send('pause');
      const pauseMs = performance.now() - before;
      await delay(300);
      const resumed = await send('resume');
      await delay(1200);
      before = performance.now();
      const stopped = await send('stop');
      const stopMs = performance.now() - before;
      const exit = await exited;
      assert.deepEqual(
        exit,
        { code: 0, signal: null },
        'durable helper survives live reader failure',
      );
      assert.ok(pauseMs < 200, 'pause remains within existing target');
      assert.ok(stopMs < 1000, 'stop acknowledgement stays bounded');
      const tracks = {};
      for (const track of ['microphone', 'meeting']) {
        const folder = join(work, 'audio', track);
        const chunks = (await readFile(join(folder, 'chunks.log'), 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        assert.ok(chunks.length > 0);
        assert.ok(chunks.every((c) => c.endNs <= paused.atNs || c.startNs >= resumed.atNs));
        assert.ok(chunks.every((c) => c.endNs <= stopped.atNs));
        assert.equal((await readdir(folder)).filter((f) => f.endsWith('.part')).length, 0);
        tracks[track] = { chunks: chunks.length, frames: chunks.reduce((n, c) => n + c.frames, 0) };
      }
      if (mode === 'read') {
        assert.equal(decodeError, undefined);
        decoder.end();
        assert.ok(frames.some((f) => f.track === 'mic' && !f.boundary));
        assert.ok(frames.some((f) => f.track === 'meeting' && !f.boundary));
        for (const f of frames.filter((f) => !f.boundary)) {
          assert.ok(pcmEndNs(f) <= paused.atNs || f.startNs >= resumed.atNs);
          assert.ok(pcmEndNs(f) <= stopped.atNs);
        }
      }
      assert.ok(!events.some((e) => e.event === 'writeError'));
      console.log(
        JSON.stringify({ mode, pauseMs, stopMs, wireFrames: frames.length, tracks, exit }),
      );
    } finally {
      child.kill();
      lines.close();
      child.stdio[3].destroy();
    }
  }
} finally {
  player.kill();
}
