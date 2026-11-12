import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LiveAudioWorker,
  type LiveAudioEvent,
  type LiveModelHost,
} from '../src/liveAudioWorker.js';
import { toolsIn, type ModelPaths } from '../src/config.js';
import type { LivePcmFrame } from '../src/livePcmProtocol.js';
import { WorkerProcess } from '../src/worker.js';
import type { TraceRecord } from '../src/liveTrace.js';
import { analyzeLiveTrace } from '../src/liveTraceAnalysis.js';

const models: ModelPaths = {
  speechLive: 'unused',
  speechFinal: 'unused',
  vad: 'unused',
  segmentation: 'unused',
  embedding: 'unused',
};
const frame = (sequence: number, track: 'mic' | 'meeting' = 'mic'): LivePcmFrame => ({
  track,
  sequence,
  generation: 0,
  boundary: false,
  startNs: sequence * 100e6,
  samples: new Int16Array(1600).fill(100),
});

function fakeWorker(mode: 'ack' | 'crash' | 'once' | 'hang' | 'bad' = 'ack'): string[] {
  return [
    '-e',
    `
    process.on('message', m => { if(m.type === 'init') {
      process.send({type:'ready'});
      ${mode === 'crash' ? 'process.exit(3);' : ''}
      ${mode === 'once' ? "if(m.workDir.endsWith('worker-1')) process.exit(3);" : ''}
    }});
    let buffer = Buffer.alloc(0);
    process.stdin.on('data', b => {
      buffer=Buffer.concat([buffer,b]);
      while(buffer.length >= 32 && buffer.length >= 32+buffer.readUInt32LE(28)*2) {
        const size=32+buffer.readUInt32LE(28)*2;
        const f=buffer.subarray(0,size); buffer=buffer.subarray(size);
        const track=f[5]===0?'mic':'meeting', sequence=f.readUInt32LE(8);
        const startNs=Number(f.readBigUInt64LE(16)), endNs=startNs+f.readUInt32LE(28)*62500;
        ${mode === 'hang' ? 'continue;' : ''}
        ${mode === 'bad' ? "process.send({type:'segment',segment:{text:'private untrusted text'}}); continue;" : ''}
        process.send({type:'ack',track,sequence,bufferedStartNs:endNs});
      }
    });
  `,
  ];
}

describe('isolated live audio supervisor with invented processes', () => {
  let root: string;
  let workers: LiveAudioWorker[];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scrb-live-test-'));
    workers = [];
  });
  afterEach(async () => {
    await Promise.all(workers.map((w) => w.close()));
    await rm(root, { recursive: true, force: true });
  });

  const readyModels = async (): Promise<LiveModelHost> => ({
    port: 12345,
    detect: async () => [],
    close: async () => undefined,
  });

  const start = async (
    events: LiveAudioEvent[],
    extra: Partial<Parameters<typeof LiveAudioWorker.start>[0]> = {},
  ) => {
    const worker = await LiveAudioWorker.start({
      tools: toolsIn('unused'),
      models,
      onEvent: (event) => events.push(event),
      tempRoot: root,
      startModels: readyModels,
      workerArgs: fakeWorker(),
      startTimeoutMs: 5000,
      ...extra,
    });
    workers.push(worker);
    return worker;
  };

  it('forwards bounded run-scoped merges, rejecting stale, duplicate and out-of-order metadata after ACK', async () => {
    const events: LiveAudioEvent[] = [];
    const code = fakeWorker()[1]!.replace(
      "process.send({type:'ack',track,sequence,bufferedStartNs:endNs});",
      `process.send({type:'ack',track,sequence,bufferedStartNs:endNs});
       for(const [generation,order] of [[1,1],[0,2],[0,2],[0,1],[0,3]])
         process.send({type:'speakerMerge',merge:{from:'live-1',into:'live-2',generation,order,label:'Speaker 1'}});`,
    );
    const worker = await start(events, { workerArgs: ['-e', code] });
    worker.offer(frame(0, 'meeting'));
    const validMerges = (received: LiveAudioEvent[]) => {
      const merges = received.flatMap((e) => (e.type === 'speakerMerge' ? [e.merge] : []));
      expect([[3], [2, 3]]).toContainEqual(merges.map((m) => m.order));
      const workerRun = merges[0]!.workerRun;
      for (const merge of merges) {
        expect(merge.generation).toBe(0);
        expect(merge.workerRun).toBe(workerRun);
        expect(merge.from).toBe(`${workerRun}-live-1`);
        expect(merge.into).toBe(`${workerRun}-live-2`);
      }
      return merges;
    };
    const merges = await vi.waitFor(() => validMerges(events));
    await worker.close();
    const more: LiveAudioEvent[] = [];
    const separate = await start(more, { workerArgs: ['-e', code] });
    separate.offer(frame(0, 'meeting'));
    const nextMerges = await vi.waitFor(() => validMerges(more));
    expect(nextMerges[0]!.workerRun).not.toBe(merges[0]!.workerRun);
  });

  it('forwards validated attribution after ACK with stable namespaced speaker identities', async () => {
    const events: LiveAudioEvent[] = [];
    const code = fakeWorker()[1]!.replace(
      "process.send({type:'ack',track,sequence,bufferedStartNs:endNs});",
      `const segment = { id:'attributed', track, sequence, generation:0, startMs:0, endMs:50,
        text:'word', words:[{text:'word', startMs:0,endMs:50,confidence:1}],
        speakerId:'meeting',speakerLabel:'Meeting',provisional:true };
      process.send({type:'segment',segment});
      process.send({type:'ack',track,sequence,bufferedStartNs:endNs});
      setImmediate(() => process.send({type:'attribution',segment:{...segment,
        wordSpeakers:[{id:'live-1',label:'Speaker 1'}]}}));`,
    );
    const worker = await start(events, { workerArgs: ['-e', code] });
    worker.offer(frame(0, 'meeting'));
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'segment')).toHaveLength(2));
    const segments = events.flatMap((e) => (e.type === 'segment' ? [e.segment] : []));
    expect(segments[1]!.id).toBe(segments[0]!.id);
    expect(segments[1]!.words).toEqual(segments[0]!.words);
    expect(segments[1]!.wordSpeakers).toEqual([
      { id: `${segments[0]!.id.slice(0, -'attributed'.length)}live-1`, label: 'Speaker 1' },
    ]);
    expect(events.some((e) => e.type === 'failed')).toBe(false);
  });

  it.each([null, [], [{ id: 'invalid', label: 'Speaker 1' }]])(
    'discards malformed optional attribution %j and continues text delivery and ACKs',
    async (wordSpeakers) => {
      const events: LiveAudioEvent[] = [];
      const code = fakeWorker()[1]!.replace(
        "process.send({type:'ack',track,sequence,bufferedStartNs:endNs});",
        `const segment = { id:'valid-'+sequence, track, sequence, generation:0,
          startMs:startNs/1e6, endMs:startNs/1e6+50, text:'word'+sequence,
          words:[{text:'word'+sequence,startMs:startNs/1e6,endMs:startNs/1e6+50,confidence:1}],
          speakerId:'meeting',speakerLabel:'Meeting',provisional:true };
        process.send({type:'segment',segment});
        if(sequence===0) process.send({type:'attribution',segment:{...segment,
          wordSpeakers:${JSON.stringify(wordSpeakers)}}});
        process.send({type:'ack',track,sequence,bufferedStartNs:endNs});`,
      );
      const worker = await start(events, { workerArgs: ['-e', code] });
      worker.offer(frame(0, 'meeting'));
      await vi.waitFor(() => expect(worker.getProgress().lastAckAtMs).not.toBeNull());
      worker.offer(frame(1, 'meeting'));
      await vi.waitFor(() => expect(events.filter((e) => e.type === 'segment')).toHaveLength(2));
      await worker.close();
      expect(events.flatMap((e) => (e.type === 'segment' ? [e.segment.text] : []))).toEqual([
        'word0',
        'word1',
      ]);
      expect(events.some((e) => e.type === 'restarting' || e.type === 'failed')).toBe(false);
      expect(worker.getProgress().stats['meeting.sentFrames']).toBe(2);
    },
  );

  it('bounds each track independently during startup, dropping oldest live PCM without mutating recording input', async () => {
    const events: LiveAudioEvent[] = [];
    let release!: (host: LiveModelHost) => void;
    const pending = new Promise<LiveModelHost>((resolve) => {
      release = resolve;
    });
    const worker = await start(events, { maxQueuedFrames: 2, startModels: () => pending });
    const recorded: Int16Array[] = [];
    for (let i = 0; i < 5; i++) {
      const input = frame(i);
      recorded.push(input.samples.slice());
      expect(worker.offer(input)).toBe(true);
    }
    worker.offer(frame(0, 'meeting'));
    await Promise.resolve();
    expect(
      events
        .filter((e) => e.type === 'skipped')
        .map((e) => (e.type === 'skipped' ? e.gap.startMs : -1)),
    ).toEqual([0]);
    expect(events.find((e) => e.type === 'skipped')).toMatchObject({
      gap: { startMs: 0, endMs: 300 },
    });
    expect(events.at(-1)).toMatchObject({ type: 'lag', queuedFrames: 3 });
    expect(recorded.every((pcm) => pcm.length === 1600 && pcm.every((s) => s === 100))).toBe(true);
    release(await readyModels());
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ type: 'lag', queuedFrames: 0 }));
    expect(worker.offer(frame(4))).toBe(false);
    expect(worker.offer({ ...frame(5), samples: new Int16Array(1601) })).toBe(false);
  });

  it('restarts a dead dispatcher at most three times, cleaning up every supervisor-owned model process', async () => {
    const events: LiveAudioEvent[] = [];
    const owned: WorkerProcess[] = [];
    let closed = 0;
    const worker = await start(events, {
      workerArgs: fakeWorker('crash'),
      startModels: async () => {
        const model = new WorkerProcess({
          name: 'invented-model',
          command: process.execPath,
          args: ['-e', 'setInterval(()=>{},1000)'],
        });
        model.stdout.resume();
        owned.push(model);
        return {
          port: 12345,
          detect: async () => [],
          close: async () => {
            model.kill();
            await model.done;
            closed++;
          },
        };
      },
    });
    for (let i = 0; i < 10; i++) worker.offer(frame(i));
    await vi.waitFor(() => expect(events.some((e) => e.type === 'failed')).toBe(true), {
      timeout: 10_000,
    });
    await worker.close();
    expect(
      events
        .filter((e) => e.type === 'restarting')
        .map((e) => (e.type === 'restarting' ? e.attempt : -1)),
    ).toEqual([1, 2, 3]);
    expect(owned).toHaveLength(4);
    expect(closed).toBe(4);
    expect((await Promise.all(owned.map((p) => p.done))).every((exit) => exit.killed)).toBe(true);
    expect(await readdir(root)).toEqual([]);
    expect(worker.offer(frame(99))).toBe(false);
  });

  it('times out a hung request, marks live-only skips, and preserves the separate invented recorder', async () => {
    const events: LiveAudioEvent[] = [];
    const saved: number[] = [];
    const sentinel = join(root, 'saved-recording.sentinel');
    await writeFile(sentinel, 'invented durable recording bytes');
    const worker = await start(events, { workerArgs: fakeWorker('hang'), requestTimeoutMs: 40 });
    for (let i = 0; i < 10; i++) {
      saved.push(i);
      worker.offer(frame(i));
    }
    await vi.waitFor(() => expect(events.some((e) => e.type === 'failed')).toBe(true), {
      timeout: 10_000,
    });
    expect(saved).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(events.filter((e) => e.type === 'skipped' && e.gap.reason === 'worker')).toHaveLength(4);
    await worker.close();
    expect(await readFile(sentinel, 'utf8')).toBe('invented durable recording bytes');
    expect(await readdir(root)).toEqual(['saved-recording.sentinel']);
  });

  it('resumes queued PCM after one worker death and requires a new generation after a boundary', async () => {
    const events: LiveAudioEvent[] = [];
    let starts = 0;
    const worker = await start(events, {
      workerArgs: fakeWorker('once'),
      startModels: async () => {
        starts++;
        return readyModels();
      },
    });
    for (let i = 0; i < 5; i++) worker.offer(frame(i));
    await vi.waitFor(
      () => {
        expect(starts).toBe(2);
        expect(events.at(-1)).toMatchObject({ type: 'lag', queuedFrames: 0 });
      },
      { timeout: 5000 },
    );
    expect(events.filter((e) => e.type === 'restarting')).toEqual([
      { type: 'restarting', attempt: 1 },
    ]);
    expect(worker.offer({ ...frame(5), boundary: true, samples: new Int16Array() })).toBe(true);
    expect(worker.offer(frame(6, 'mic'))).toBe(false);
    expect(worker.offer({ ...frame(6), generation: 1 })).toBe(true);
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ type: 'lag', queuedFrames: 0 }));
  });

  it('rejects malformed output without exposing child error text, and tolerates observer exceptions', async () => {
    const events: LiveAudioEvent[] = [];
    const worker = await start(events, {
      workerArgs: fakeWorker('bad'),
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'lag') throw new Error('observer');
      },
    });
    for (let i = 0; i < 5; i++) expect(worker.offer(frame(i))).toBe(true);
    await vi.waitFor(() => expect(events.some((e) => e.type === 'failed')).toBe(true), {
      timeout: 10_000,
    });
    expect(JSON.stringify(events)).not.toContain('private untrusted text');
    expect(events.filter((e) => e.type === 'segment')).toEqual([]);
  });

  it('cleans up an aborted startup without waiting for owner interaction or touching recording paths', async () => {
    const events: LiveAudioEvent[] = [];
    let started = false;
    const worker = await start(events, {
      startModels: (_dir, signal) =>
        new Promise((_resolve, reject) => {
          started = true;
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    });
    await vi.waitFor(() => expect(started).toBe(true));
    worker.offer(frame(0));
    await worker.close();
    expect(events.filter((e) => e.type === 'failed')).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it('defers observers off the producer stack and coalesces a flood of contiguous overflow status', async () => {
    const events: LiveAudioEvent[] = [];
    const worker = await start(events, { maxQueuedFrames: 2 });
    for (let i = 0; i < 1000; i++) expect(worker.offer(frame(i))).toBe(true);
    expect(events).toEqual([]);
    await Promise.resolve();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'skipped', gap: { startMs: 0, endMs: 99_800 } });
    expect(events[1]).toMatchObject({ type: 'lag', queuedFrames: 2 });
  });

  it('counts frames separately at each stage, in the same totals', async () => {
    const events: LiveAudioEvent[] = [];
    const worker = await start(events, {
      maxQueuedFrames: 1,
      startModels: () => new Promise(() => undefined),
    });
    worker.offer(frame(0));
    worker.offer(frame(0));
    worker.offer(frame(3));
    worker.offer(frame(0, 'meeting'));
    const { stats } = worker.getProgress();
    expect(stats).toMatchObject({
      'mic.rejectedFrames': 1,
      'mic.inputLostFrames': 2,
      'mic.overflowFrames': 1,
      'mic.sentFrames': 0,
      'meeting.overflowFrames': 0,
    });
  });

  it('bounds noncontiguous status overflow and disables only live work', async () => {
    const events: LiveAudioEvent[] = [];
    const worker = await start(events, { maxQueuedFrames: 1 });
    for (let i = 0; i < 100; i++) worker.offer({ ...frame(i), startNs: i * 1000e6 });
    await Promise.resolve();
    expect(events).toEqual([{ type: 'failed', reason: 'status-overflow' }]);
    expect(worker.offer(frame(999))).toBe(false);
    await worker.close();
    expect(await readdir(root)).toEqual([]);
  });

  it('runs the actual PCM dispatcher with fake VAD and a loopback word-timing model, then cleans its scratch', async () => {
    const events: LiveAudioEvent[] = [];
    const forms: string[] = [];
    const compiled = join(root, 'compiled');
    const compiler = new WorkerProcess({
      name: 'test-build',
      command: process.execPath,
      args: [
        createRequire(import.meta.url).resolve('typescript/bin/tsc'),
        '--project',
        join(import.meta.dirname, '../tsconfig.build.json'),
        '--outDir',
        compiled,
      ],
      timeoutMs: 15_000,
    });
    compiler.stdout.resume();
    expect((await compiler.done).code).toBe(0);
    await writeFile(join(compiled, 'package.json'), JSON.stringify({ type: 'module' }));
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      forms.push(Buffer.concat(chunks).toString('latin1'));
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          text: 'Hello world',
          segments: [
            {
              words: [
                { word: ' Hel', start: 0.01, end: 0.04, probability: 0.9 },
                { word: 'lo', start: 0.04, end: 0.1, probability: 0.8 },
                { word: ' world', start: 0.12, end: 0.2, probability: 0.9 },
              ],
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test port');
      const inputs: number[] = [];
      const worker = await start(events, {
        traceDirectory: join(root, 'preserved-trace'),
        workerArgs: [join(compiled, 'liveWorkerEntry.js')],
        startModels: async (workDir) => ({
          port: address.port,
          detect: async (track) => {
            const wav = await readFile(join(workDir, `vad-${track}.wav`));
            inputs.push(wav.readInt16LE(44));
            return [{ startMs: 0, endMs: 200 }];
          },
          close: async () => undefined,
        }),
      });
      for (const track of ['mic', 'meeting'] as const) {
        for (let i = 0; i < 5; i++) {
          const f = {
            ...frame(i, track),
            startNs: (track === 'mic' ? 1000 : 2000) * 1e6 + i * 100e6,
          };
          worker.offer(f);
          f.samples.fill(999); // offer must own its copy, not borrow recording buffers.
          await Promise.resolve();
          await vi.waitFor(() =>
            expect(events.at(-1)).toMatchObject({ type: 'lag', queuedFrames: 0 }),
          );
          if (track === 'mic' && i === 4) expect(events.at(-1)).toMatchObject({ lagMs: 300 });
        }
      }
      const segments = events.flatMap((e) => (e.type === 'segment' ? [e.segment] : []));
      expect(
        segments.map((s) => [s.track, s.words.map((w) => [w.text, w.startMs, w.endMs])]),
      ).toEqual([
        [
          'mic',
          [
            ['Hello', 1010, 1100],
            ['world', 1120, 1200],
          ],
        ],
        [
          'meeting',
          [
            ['Hello', 2010, 2100],
            ['world', 2120, 2200],
          ],
        ],
      ]);
      expect(inputs).toEqual([100, 100]);
      expect(forms).toHaveLength(2);
      expect(
        forms.every(
          (form) =>
            form.includes('verbose_json') &&
            form.includes('name="token_timestamps"') &&
            form.includes('name="max_len"'),
        ),
      ).toBe(true);
      await worker.close();
      await worker.close();
      await vi.waitFor(async () => {
        const files = await readdir(join(root, 'preserved-trace'));
        const lines = await Promise.all(
          files.map((f) => readFile(join(root, 'preserved-trace', f), 'utf8')),
        );
        expect(lines.some((s) => s.includes('"stage":"trace_end"'))).toBe(true);
      });
      const traceFiles = await readdir(join(root, 'preserved-trace'));
      const traceText = (
        await Promise.all(traceFiles.map((f) => readFile(join(root, 'preserved-trace', f), 'utf8')))
      ).join('');
      const records = traceText
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s) as TraceRecord);
      expect(records.some((r) => r.stage === 'segment_received')).toBe(true);
      expect(records.some((r) => r.stage === 'segment_delivered')).toBe(true);
      expect(records.some((r) => r.stage === 'frame_dequeue' && r.queueDelayMs !== undefined)).toBe(
        true,
      );
      expect(analyzeLiveTrace(records).observations.some((r) => r.state === 'DELIVERED')).toBe(
        true,
      );
      expect(traceText).not.toMatch(/Hello|world|localhost|127\.0\.0|scrb-live-pcm-/);
      expect(await readdir(root)).toEqual(['compiled', 'preserved-trace']);
      expect(existsSync(join(root, 'audio'))).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
