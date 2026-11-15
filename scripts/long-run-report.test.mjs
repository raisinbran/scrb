// End to end: runs `overnight.mjs --report` on a synthetic evidence folder and checks the real exit code and RESULT line.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = join(dirname(fileURLToPath(import.meta.url)), 'long-run', 'overnight.mjs');
const CHUNKS = 200; // 5 s each, 1000 s
const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Builds one track: gapFor(i) is the signed difference (ns) before chunk i; frames/closeReason per chunk. */
function track(gapFor, { frameFor = () => 240000, causeFor = () => '', missingFor = () => 0 } = {}) {
  const chunks = [];
  const log = [];
  let at = 0;
  for (let i = 0; i < CHUNKS; i += 1) {
    const startNs = i === 0 ? 0 : at + gapFor(i);
    const endNs = startNs + 5e9;
    chunks.push({ seq: i, startNs, endNs, openReason: i === 0 ? 'start' : 'rollover', closeReason: 'rollover', state: 'complete' });
    log.push(JSON.stringify({
      file: `${String(i).padStart(6, '0')}.opus`, seq: i, startNs, endNs, frames: frameFor(i), rate: 48000,
      closeReason: 'rollover', allZero: false, missingBeforeMs: missingFor(i), missingCause: causeFor(i), overlapMs: 0, paddedSpans: [],
    }));
    at = endNs;
  }
  return { chunks, log: log.join('\n'), endNs: at };
}

function evidence({ mic, meeting, gaps = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'report-test-'));
  made.push(dir);
  mkdirSync(join(dir, 'logs'));
  const seconds = 1000;
  const samples = [1, 2, 3, 4].map((k) => ({
    atMs: k * 250000, rssMb: 16, cpu: 1, cpuSeconds: 1, stalled: [],
  }));
  writeFileSync(join(dir, 'logs', 'run.json'), JSON.stringify({
    platform: 'win32', seconds, smoke: false, stopReason: 'planned duration reached', startWall: 'synthetic',
    workerExit: { code: 0 }, stopAck: { ok: true }, eventCounts: {}, samples,
  }));
  writeFileSync(join(dir, 'logs', 'sealed.json'), JSON.stringify({
    outcome: 'ready', endNs: Math.max(mic.endNs, meeting.endNs), gaps,
    tracks: { microphone: { chunks: mic.chunks }, meeting: { chunks: meeting.chunks } },
  }));
  writeFileSync(join(dir, 'logs', 'microphone.chunks.log'), mic.log);
  writeFileSync(join(dir, 'logs', 'meeting.chunks.log'), meeting.log);
  return dir;
}

function report(dir) {
  const r = spawnSync(process.execPath, ['--experimental-transform-types', script, '--report', dir], { encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  return { code: r.status, result: lines.at(-1), text: r.stdout };
}

const jitter = (i) => (i % 2 === 1 ? 1.9e6 : -1.9e6);
const steady = () => 0;

describe('overnight.mjs --report on synthetic evidence', () => {
  it('PASSES cancelling jitter when every chunk has the expected frame count, with the warning', () => {
    // 199 boundaries of +/-1.9 ms: one-sided totals of about 190 ms each, net under 2 ms.
    const dir = evidence({ mic: track(jitter), meeting: track(steady) });
    const r = report(dir);
    expect(r.result).toBe('RESULT: PASS');
    expect(r.code).toBe(0);
    expect(r.text).toContain('WARN  microphone: large cancelling jitter, continuity not independently shown');
    expect(r.text).toContain('sample evidence: ok');
  });

  it('is INCONCLUSIVE when cancelling jitter has one chunk with a wrong frame count', () => {
    const dir = evidence({ mic: track(jitter, { frameFor: (i) => (i === 100 ? 239000 : 240000) }), meeting: track(steady) });
    const r = report(dir);
    expect(r.result).toBe('RESULT: INCONCLUSIVE');
    expect(r.code).toBe(2);
    expect(r.text).toMatch(/INCONCLUSIVE {2}microphone no lost audio/);
    expect(r.text).not.toContain('FAIL ');
  });

  it('is INCONCLUSIVE when the chunk logs are absent', () => {
    const mic = track(jitter);
    const dir = evidence({ mic: { ...mic, log: '' }, meeting: track(steady) });
    expect(report(dir).result).toBe('RESULT: INCONCLUSIVE');
  });

  // The helper marks the gap in its chunk log; the sealed file (sealAudio) drops rollover gaps under 50 ms, so
  // sealed.gaps stays empty here: the marking must come from the log.
  const gapped = (sizeNs, { cause = 'unknown', reported = sizeNs / 1e6 } = {}) => {
    const meeting = track((i) => (i === 50 ? sizeNs : 0), {
      causeFor: (i) => (i === 50 && cause ? cause : ''),
      missingFor: (i) => (i === 50 ? reported : 0),
    });
    return report(evidence({ mic: track(steady), meeting }));
  };

  it('PASSES a helper-marked 8 ms gap that sealing dropped (within the 10 ms limit)', () => {
    const r = gapped(8e6);
    expect(r.result).toBe('RESULT: PASS');
    expect(r.code).toBe(0);
    expect(r.text).toMatch(/PASS {2}meeting no lost audio: .*1 marked by the helper, 1 matched/);
  });

  it('FAILS a marked 12 ms gap and an unmarked 8 ms gap', () => {
    for (const r of [gapped(12e6), gapped(8e6, { cause: '' })]) {
      expect(r.result).toBe('RESULT: FAIL');
      expect(r.code).toBe(1);
      expect(r.text).toMatch(/FAIL {2}meeting no lost audio/);
      expect(r.text).toMatch(/PASS {2}microphone no lost audio/);
    }
  });

  it('is INCONCLUSIVE when the helper reports a different duration than the measured gap', () => {
    expect(gapped(8e6, { reported: 0 }).result).toBe('RESULT: INCONCLUSIVE');
    expect(gapped(8e6, { reported: 3 }).result).toBe('RESULT: INCONCLUSIVE');
  });

  it('FAILS six 10 ms marked gaps (60 ms) on each track: the 100 ms cap is per run, not per track', () => {
    const both = () => track((i) => (i % 30 === 0 && i > 0 ? 10e6 : 0), {
      causeFor: (i) => (i % 30 === 0 && i > 0 ? 'unknown' : ''),
      missingFor: (i) => (i % 30 === 0 && i > 0 ? 10 : 0),
    });
    const r = report(evidence({ mic: both(), meeting: both() }));
    expect(r.result).toBe('RESULT: FAIL');
    expect(r.text).toMatch(/PASS {2}microphone no lost audio/);
    expect(r.text).toMatch(/PASS {2}meeting no lost audio/);
    expect(r.text).toMatch(/FAIL {2}marked gaps total, whole run: 120.0 ms/);
  });
});
