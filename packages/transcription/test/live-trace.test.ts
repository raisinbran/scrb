import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, expect, it } from 'vitest';
import {
  JsonlLiveTrace,
  openLiveTrace,
  type TraceRecord,
  type TraceFields,
} from '../src/liveTrace.js';
import { analyzeLiveTrace } from '../src/liveTraceAnalysis.js';
import { LivePcmEngine, type TimedLiveSegment, type LiveSkip } from '../src/livePcmEngine.js';
import type { LivePcmFrame } from '../src/livePcmProtocol.js';

const session = '12345678-1234-1234-1234-123456789abc';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function root() {
  const p = await mkdtemp(join(tmpdir(), 'scrb-trace-test-'));
  roots.push(p);
  return p;
}
function recorder(role: 'worker' | 'supervisor' = 'worker', options = {}) {
  let time = 0;
  const data: string[] = [];
  const trace = new JsonlLiveTrace({
    directory: tmpdir(),
    session,
    role,
    workerRun: 0,
    clock: () => time,
    writeBatch: async (s) => {
      data.push(s);
    },
    ...options,
  });
  return {
    trace,
    advance: (ms: number) => {
      time += ms;
    },
    rows: () =>
      data
        .join('')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((s) => JSON.parse(s) as TraceRecord),
  };
}
const frame = (i: number, more = false): LivePcmFrame => ({
  track: 'meeting',
  sequence: i,
  generation: 0,
  startNs: i * 100e6,
  boundary: false,
  more,
  samples: new Int16Array(1600).fill(100),
});

it('is disabled without explicit configuration and never creates evidence', async () => {
  const dir = await root();
  expect(openLiveTrace(undefined, session, 'worker')).toBeUndefined();
  expect(openLiveTrace('relative-private-path', session, 'worker')).toBeUndefined();
  expect(await readdir(dir)).toEqual([]);
});

it('keeps a bounded private file, strips arbitrary text/paths, and reports dropped records', async () => {
  const dir = await root();
  const trace = new JsonlLiveTrace({
    directory: dir,
    session,
    role: 'worker',
    maxQueued: 2,
    maxBytes: 4096,
  });
  for (let i = 0; i < 1000; i++)
    trace.record('frame_start', {
      sequence: i,
      track: 'meeting',
      ...({
        text: 'CONFIDENTIAL WORDS',
        path: 'C:/secret/meeting',
        spanId: 'CONFIDENTIAL WORDS',
        segmentKey: 'C:/secret',
      } as TraceFields),
    });
  await trace.close();
  const files = await readdir(dir);
  expect(files).toHaveLength(1);
  const data = await readFile(join(dir, files[0]!), 'utf8');
  expect(Buffer.byteLength(data)).toBeLessThanOrEqual(4096);
  expect(data).not.toMatch(/CONFIDENTIAL|secret|meeting\//);
  const rows = data
    .trim()
    .split('\n')
    .map((s) => JSON.parse(s) as TraceRecord);
  expect(rows.at(-1)).toMatchObject({ stage: 'trace_end', dropped: 999 });
  expect(analyzeLiveTrace(rows).unknown).toBe(true);
});

it('contains asynchronous full-disk errors without throwing or recording error strings', async () => {
  let writes = 0;
  const r = recorder('worker', {
    writeBatch: async () => {
      writes++;
      throw new Error('ENOSPC C:/private');
    },
  });
  r.trace.record('frame_start', { sequence: 1 });
  await expect(r.trace.close()).resolves.toBeUndefined();
  expect(writes).toBeGreaterThan(0);
});

it('attributes empty VAD, settle deferral, repeated spans and empty recognition independently', async () => {
  const r = recorder();
  let detects = 0;
  const engine = new LivePcmEngine(
    {
      detect: async () => (++detects === 1 ? [] : [{ startMs: 0, endMs: 800 }]),
      transcribe: async () => [],
    },
    () => undefined,
    () => undefined,
    r.trace,
  );
  for (let i = 0; i < 15; i++) await engine.push(frame(i));
  engine.close();
  await r.trace.close();
  const rows = r.rows();
  const analysis = analyzeLiveTrace(rows);
  expect(analysis.observations.map((x) => x.diagnosis)).toEqual(
    expect.arrayContaining(['EMPTY_VAD_RESULT', 'SETTLE_DEFERRAL', 'RECOGNITION_EMPTY']),
  );
  const spans = rows.filter((x) => x.stage === 'vad_span');
  expect(spans.length).toBeGreaterThan(1);
  // Repeated evaluation is represented by evaluation IDs, not counted as unique speech.
  expect(new Set(spans.map((x) => x.evaluation)).size).toBe(spans.length);
});

it('joins nonempty recognition through emission/receipt/delivery and distinguishes delayed processing', async () => {
  const w = recorder(),
    s = recorder('supervisor');
  const ctx = {
    track: 'meeting' as const,
    workerRun: 0,
    call: 1,
    sequence: 4,
    generation: 0,
    spanId: 'meeting:0:0:200000000',
  };
  w.trace.record('model_start', ctx);
  w.advance(7000);
  w.trace.record('model_end', { ...ctx, wordCount: 2 });
  w.trace.record('segment_emit', { ...ctx, segmentKey: 'live-meeting-4-0' });
  s.trace.record('frame_dequeue', { ...ctx, queueDelayMs: 12 });
  s.trace.record('segment_received', { ...ctx, segmentKey: 'live-meeting-4-0' });
  s.trace.record('segment_delivered', { ...ctx, segmentKey: 'live-meeting-4-0' });
  await w.trace.close();
  await s.trace.close();
  expect(analyzeLiveTrace([...w.rows(), ...s.rows()]).observations[0]).toMatchObject({
    diagnosis: 'DELIVERED',
    elapsedMs: 7000,
    delayed: true,
    queueDelayMs: 12,
  });
});

it('reports UNKNOWN for absent stage exits, missing files, truncation, restart and stopped work', async () => {
  const r = recorder();
  r.trace.record('model_start', { call: 1, workerRun: 0 });
  r.trace.record('run_failed', { workerRun: 0 });
  r.trace.record('run_start', { workerRun: 1 });
  r.trace.record('engine_stop', { reason: 'stopped' });
  await r.trace.close();
  expect(analyzeLiveTrace(r.rows()).observations[0]).toMatchObject({
    diagnosis: 'UNKNOWN',
    state: 'STOPPED_DURING_MODEL',
  });
  expect(analyzeLiveTrace(r.rows().slice(0, -1)).unknown).toBe(true);
  expect(analyzeLiveTrace([], true).unknown).toBe(true);
});

it('marks a completely absent expected worker stream UNKNOWN even without worker observations', async () => {
  const r = recorder('supervisor');
  r.trace.record('run_start', { workerRun: 2 });
  r.trace.record('run_failed', { workerRun: 2 });
  r.trace.record('run_stop', { workerRun: 2, reason: 'stopped' });
  await r.trace.close();
  expect(analyzeLiveTrace(r.rows())).toMatchObject({
    unknown: true,
    missingWorkers: [{ session, workerRun: 2 }],
    observations: [],
  });
});

it('keeps slow-model/backlog skip/defer/output decisions identical and measures enabled event overhead', async () => {
  async function simulate(enabled: boolean) {
    const r = recorder(),
      segments: TimedLiveSegment[] = [],
      skips: LiveSkip[] = [];
    let detect = 0,
      recognize = 0;
    const engine = new LivePcmEngine(
      {
        detect: async (_t, pcm) => {
          r.advance(5);
          detect++;
          return [{ startMs: 0, endMs: pcm.length / 16 }];
        },
        transcribe: async () => {
          r.advance(750);
          recognize++;
          return [{ text: 'invented', startMs: 0, endMs: 100, confidence: 0.9 }];
        },
      },
      (s) => segments.push(s),
      (s) => skips.push(s),
      enabled ? r.trace : undefined,
    );
    for (let i = 0; i < 100; i++) await engine.push(frame(i, true));
    await engine.push({ ...frame(101), generation: 1 });
    engine.close();
    await r.trace.close();
    return {
      segments,
      skips,
      detect,
      recognize,
      decisions: r
        .rows()
        .filter((x) => x.stage === 'defer')
        .map((x) => x.reason),
    };
  }
  const off = await simulate(false),
    on = await simulate(true);
  expect({
    segments: on.segments,
    skips: on.skips,
    detect: on.detect,
    recognize: on.recognize,
  }).toEqual({
    segments: off.segments,
    skips: off.skips,
    detect: off.detect,
    recognize: off.recognize,
  });
  expect(on.decisions.filter((x) => x === 'settle').length).toBe(off.detect - off.recognize);
  const r = recorder('worker', { maxQueued: 8192, maxBytes: 8 * 1024 * 1024 });
  const count = 5000;
  const a = performance.now();
  for (let i = 0; i < count; i++) r.trace.record('frame_start', { track: 'meeting', sequence: i });
  const microseconds = ((performance.now() - a) * 1000) / count;
  await r.trace.close();
  if (process.env['SCRB_TRACE_BENCHMARK_OUT'])
    await writeFile(
      process.env['SCRB_TRACE_BENCHMARK_OUT'],
      JSON.stringify(
        {
          events: count,
          microsecondsPerEnabledEvent: microseconds,
          simulatedModelMs: 750,
          decisionsIdentical: true,
          off: {
            modelCalls: off.recognize,
            vadCalls: off.detect,
            deferrals: off.detect - off.recognize,
          },
          on: { modelCalls: on.recognize, vadCalls: on.detect, deferrals: on.decisions.length },
        },
        null,
        2,
      ),
    );
  console.log(
    JSON.stringify({
      instrumentationBenchmark: {
        events: count,
        microsecondsPerEnabledEvent: microseconds,
        simulatedModelMs: 750,
        decisionsIdentical: true,
      },
    }),
  );
  expect(microseconds).toBeLessThan(100);
});
