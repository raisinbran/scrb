import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  alignmentLag,
  createManifest,
  encodeWav,
  evaluate,
  leakageReduction,
  parseWav,
  roomEcho,
  scoreWer,
  verifyInvariants,
} from './noise-bleed-metrics.mjs';

const RATE = 16000;
function noise(n, seed = 1) {
  let a = seed;
  return Float32Array.from({ length: n }, () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return (a / 2 ** 32 - 0.5) * 0.4;
  });
}

// Deterministic pseudo-speech: bursts of a chirpy tone (no RNG).
function speech(seconds) {
  const x = new Float32Array(seconds * RATE);
  const hiss = noise(x.length, 7).map((v) => v * 0.15);
  for (let i = 0; i < x.length; i++) {
    const env = Math.sin((Math.PI * i) / (0.4 * RATE)) ** 2;
    x[i] =
      0.2 * env * (Math.sin(i * 0.05 + 3 * Math.sin(i * 0.0007)) + 0.5 * Math.sin(i * 0.11)) +
      hiss[i];
  }
  return x;
}
const scale = (x, g) => x.map((v) => v * g);
const delay = (x, n) => Float32Array.from({ length: x.length }, (_, i) => (i >= n ? x[i - n] : 0));

describe('wav round trip', () => {
  it('encodes and parses', () => {
    const w = parseWav(encodeWav(Float32Array.from([0, 0.5, -0.5]), RATE));
    expect(w.rate).toBe(RATE);
    expect(w.samples[1]).toBeCloseTo(0.5, 3);
  });
  it('rejects non-WAV', () => expect(() => parseWav(Buffer.from('nope nope nope'))).toThrow());
});

describe('roomEcho', () => {
  it('is deterministic and starts at the delay', () => {
    const ref = speech(1);
    const a = roomEcho(ref, RATE, 100);
    expect(a).toEqual(roomEcho(ref, RATE, 100));
    expect(a[Math.round(0.099 * RATE)]).toBe(0);
  });
});

describe('leakageReduction', () => {
  it('reports 20 dB for a tenth-amplitude filtered copy', () => {
    const ref = speech(3);
    const mic = roomEcho(ref, RATE, 200, 0.5);
    const r = leakageReduction(mic, scale(mic, 0.1), ref, RATE, { echoDelayMs: 200 });
    expect(r.medianDb).toBeCloseTo(20, 1);
    expect(r.pooledDb).toBeCloseTo(20, 1);
  });
  it('ignores frames where the far end is silent', () => {
    const ref = new Float32Array(RATE);
    expect(leakageReduction(speech(1), speech(1), ref, RATE).frames).toBe(0);
  });
  it('honours a window mask', () => {
    const ref = speech(3);
    const r = leakageReduction(ref, scale(ref, 0.5), ref, RATE, { mask: [{ from: 0, to: 1 }] });
    expect(r.frames).toBeLessThanOrEqual(50);
  });
});

describe('alignmentLag', () => {
  it('finds a +20 ms and a -10 ms lag', () => {
    const x = speech(4);
    expect(alignmentLag(x, delay(x, 320), RATE).ms).toBeCloseTo(20, 0);
    expect(alignmentLag(delay(x, 160), x, RATE).ms).toBeCloseTo(-10, 0);
  });
  it('is invalid for silent filtered output, not zero latency', () => {
    const r = alignmentLag(speech(4), new Float32Array(4 * RATE), RATE);
    expect(r.status).toMatch(/silent/);
    expect(r.ms).toBeNaN();
  });
  it('is invalid for uncorrelated output', () => {
    expect(alignmentLag(speech(4), noise(4 * RATE), RATE).status).toMatch(/weak correlation/);
  });
  it('is invalid when the lag sits at the search boundary', () => {
    const x = speech(4);
    expect(alignmentLag(x, delay(x, 1600), RATE).status).toBe('lag at search boundary');
  });
  it('is invalid for ambiguous periodic signals', () => {
    const tone = Float32Array.from(
      { length: 4 * RATE },
      (_, i) => 0.3 * Math.sin((2 * Math.PI * 200 * i) / RATE),
    );
    expect(alignmentLag(tone, delay(tone, 40), RATE).status).toBe('ambiguous correlation peaks');
  });
  it('is invalid for a clip too short to search', () => {
    expect(alignmentLag(speech(1), speech(1), RATE).status).toMatch(/too short/);
  });
});

describe('invariants', () => {
  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'bleed-'));
    mkdirSync(join(dir, 'orig', 'chunks'), { recursive: true });
    mkdirSync(join(dir, 'work'));
    writeFileSync(join(dir, 'orig', 'mic.wav'), 'raw');
    writeFileSync(join(dir, 'orig', 'chunks', '0001.wav'), 'c1');
    const manifest = createManifest([join(dir, 'orig')], Date.now() - 5000);
    const out = join(dir, 'work', 'mic.wav');
    writeFileSync(out, 'filtered');
    return { dir, manifest, out };
  }
  it('passes when untouched and output is contained', () => {
    const { manifest, out } = fixture();
    expect(verifyInvariants(manifest, [out])).toEqual({ ok: true, problems: [] });
  });
  it('flags a modified original', () => {
    const { dir, manifest, out } = fixture();
    writeFileSync(join(dir, 'orig', 'chunks', '0001.wav'), 'tampered');
    expect(verifyInvariants(manifest, [out]).problems[0]).toMatch(/original modified/);
  });
  it('flags a file added to a protected chunk folder', () => {
    const { dir, manifest, out } = fixture();
    writeFileSync(join(dir, 'orig', 'chunks', '0002.wav'), 'new');
    expect(verifyInvariants(manifest, [out]).problems[0]).toMatch(/added to a protected root/);
  });
  it('flags a deleted original', () => {
    const { dir, manifest, out } = fixture();
    rmSync(join(dir, 'orig', 'mic.wav'));
    expect(verifyInvariants(manifest, [out]).problems[0]).toMatch(/original deleted/);
  });
  it('flags a replaced-by-symlink original', () => {
    const { dir, manifest, out } = fixture();
    rmSync(join(dir, 'orig', 'mic.wav'));
    symlinkSync(out, join(dir, 'orig', 'mic.wav'));
    expect(verifyInvariants(manifest, [out]).ok).toBe(false);
  });
  it('flags outputs nested in a protected root, symlinked outputs and hardlink aliases', () => {
    const { dir, manifest, out } = fixture();
    const nested = join(dir, 'orig', 'filtered.wav');
    writeFileSync(nested, 'x');
    expect(verifyInvariants(manifest, [nested]).problems.join()).toMatch(/inside a protected root/);
    const viaLink = join(dir, 'work', 'link.wav');
    symlinkSync(join(dir, 'orig', 'mic.wav'), viaLink);
    expect(verifyInvariants(manifest, [viaLink]).problems.join()).toMatch(/symlink/);
    const alias = join(dir, 'work', 'alias.wav');
    linkSync(join(dir, 'orig', 'mic.wav'), alias);
    expect(verifyInvariants(manifest, [alias]).problems.join()).toMatch(/hardlink alias/);
    const dirLink = join(dir, 'work', 'into');
    symlinkSync(join(dir, 'orig'), dirLink);
    writeFileSync(join(dir, 'work', 'into', 'sneaky.wav'), 'x');
    expect(verifyInvariants(manifest, [join(dirLink, 'sneaky.wav')]).problems.join()).toMatch(
      /protected root/,
    );
    expect(out).toBeTruthy();
  });
  it('flags a manifest taken after the filtered output was produced', () => {
    const { dir, out } = fixture();
    const late = createManifest([join(dir, 'orig')], Date.now() + 60000);
    expect(verifyInvariants(late, [out]).problems.join()).toMatch(/predates the manifest/);
  });
});

describe('evaluate', () => {
  function setup({ gain = 0.1, werFiltered = 0.2, filtered } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'bleed-eval-'));
    for (const d of ['orig', 'work']) mkdirSync(join(dir, d));
    const ref = speech(5);
    const mic = roomEcho(ref, RATE, 150, 0.5);
    writeFileSync(join(dir, 'orig', 'mic.wav'), encodeWav(mic, RATE));
    writeFileSync(join(dir, 'orig', 'ref.wav'), encodeWav(ref, RATE));
    const manifest = createManifest([join(dir, 'orig')], Date.now() - 5000);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, 'work', 'filt.wav'), encodeWav(filtered ?? scale(mic, gain), RATE));
    const cond = (extra) => ({
      unfiltered: 'orig/mic.wav',
      filtered: 'work/filt.wav',
      reference: 'orig/ref.wav',
      ...extra,
    });
    const config = {
      baseDir: dir,
      manifest: 'manifest.json',
      annotationDir: 'ann',
      conditions: [
        cond({ name: 'far-end-only', farEndOnly: true, echoDelayMs: 150 }),
        cond({
          name: 'near-end',
          nearEnd: true,
          meeting: 'X',
          nearEndSpeaker: 'A',
          hypUnfiltered: 'h1',
          hypFiltered: 'h2',
        }),
      ],
      liveLatencySamplesMs: Array.from({ length: 30 }, () => 12),
    };
    const wer = (_a, _m, hyp) =>
      hyp.endsWith('h1')
        ? { wer: 0.2, ref_words: 100, hyp_words: 90 }
        : { wer: werFiltered, ref_words: 100, hyp_words: 90 };
    return { dir, config, wer };
  }
  it('passes only with every measurement present and good', () => {
    const { config, wer } = setup();
    const r = evaluate(config, { wer });
    expect(r.notes).toEqual([]);
    expect(r.verdict).toBe('PASS');
  });
  it('fails on weak leakage reduction', () => {
    const { config, wer } = setup({ gain: 0.7 });
    const r = evaluate(config, { wer });
    expect(r.verdict).toBe('FAIL');
    expect(r.checks.medianLeakage).toBe(false);
  });
  it('fails when near-end WER is worse', () => {
    const { config, wer } = setup({ werFiltered: 0.25 });
    expect(evaluate(config, { wer }).checks.nearEndWer).toBe(false);
  });
  it('is NOT_VERIFIED for silent filtered output (no latency or leakage PASS)', () => {
    const { config, wer } = setup({ filtered: new Float32Array(5 * RATE) });
    const r = evaluate(config, { wer });
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.checks.offlineAlignmentLag).toBeNull();
    expect(r.checks.medianLeakage).toBeNull();
  });
  it('is NOT_VERIFIED for uncorrelated filtered output', () => {
    const { config, wer } = setup({ filtered: noise(5 * RATE) });
    const r = evaluate(config, { wer });
    expect(r.verdict).not.toBe('PASS');
    expect(r.checks.offlineAlignmentLag).toBeNull();
  });
  it('is NOT_VERIFIED for truncated filtered output', () => {
    const { config, wer } = setup({ filtered: speech(2) });
    expect(evaluate(config, { wer }).notes.join()).toMatch(/durations differ/);
  });
  it('requires WER for every near-end condition and a valid denominator', () => {
    const { config, wer } = setup();
    delete config.conditions[1].hypFiltered;
    expect(evaluate(config, { wer }).checks.nearEndWer).toBeNull();
    const { config: c2 } = setup();
    const tiny = () => ({ wer: 0.1, ref_words: 3, hyp_words: 3 });
    expect(evaluate(c2, { wer: tiny }).notes.join()).toMatch(/near-end reference invalid/);
  });
  it('does not treat offline alignment as live latency', () => {
    const { config, wer } = setup();
    delete config.liveLatencySamplesMs;
    const r = evaluate(config, { wer });
    expect(r.checks.liveLatencyP95).toBeNull();
    expect(r.verdict).toBe('NOT_VERIFIED');
  });
  it('fails when an original was changed after the manifest', () => {
    const { dir, config, wer } = setup();
    writeFileSync(join(dir, 'orig', 'extra.wav'), 'added');
    const r = evaluate(config, { wer });
    expect(r.checks.invariants).toBe(false);
    expect(r.verdict).toBe('FAIL');
  });
  it('is NOT_VERIFIED when the manifest does not cover the measured inputs', () => {
    const { dir, config, wer } = setup();
    mkdirSync(join(dir, 'unrelated'));
    writeFileSync(join(dir, 'unrelated', 'x.txt'), 'x');
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify(createManifest([join(dir, 'unrelated')], Date.now() - 5000)),
    );
    const r = evaluate(config, { wer });
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.notes.join()).toMatch(/manifest does not cover unfiltered input/);
  });
  it('is NOT_VERIFIED without a manifest', () => {
    const { config, wer } = setup();
    delete config.manifest;
    expect(evaluate(config, { wer }).checks.invariants).toBeNull();
  });
  it('does not score double talk as echo reduction without a far-end-only mask', () => {
    const { config, wer } = setup();
    config.conditions.push({ ...config.conditions[0], name: 'double-talk', farEndOnly: false });
    expect(evaluate(config, { wer }).notes.join()).toMatch(/double-talk: leakage not measured/);
  });
});

const python = spawnSync('python3', ['--version']).status === 0;
describe.skipIf(!python)('real scorer integration', () => {
  it('scores against one isolated speaker and window and rejects a mismatched row', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bleed-wer-'));
    mkdirSync(join(dir, 'ann', 'words'), { recursive: true });
    const words = (ws, t0) =>
      ws.map((w, i) => `<w starttime="${t0 + i}" endtime="${t0 + i + 0.5}">${w}</w>`).join('');
    writeFileSync(
      join(dir, 'ann', 'words', 'M1.A.words.xml'),
      `<nite:root>${words(['hello', 'there', 'friend'], 0)}</nite:root>`,
    );
    writeFileSync(
      join(dir, 'ann', 'words', 'M1.B.words.xml'),
      `<nite:root>${words(['remote', 'voice'], 10)}</nite:root>`,
    );
    writeFileSync(join(dir, 'good.txt'), 'hello there friend');
    writeFileSync(join(dir, 'bad.txt'), 'hello friend');
    const good = scoreWer(join(dir, 'ann'), 'M1', join(dir, 'good.txt'), { speaker: 'A' });
    expect(good).toMatchObject({ ref_words: 3, wer: 0 });
    expect(
      scoreWer(join(dir, 'ann'), 'M1', join(dir, 'bad.txt'), { speaker: 'A' }).wer,
    ).toBeCloseTo(0.3333, 3);
    expect(
      scoreWer(join(dir, 'ann'), 'M1', join(dir, 'good.txt'), { speaker: 'A', from: 1, to: 2 })
        .ref_words,
    ).toBe(1);
    expect(scoreWer(join(dir, 'ann'), 'M1', join(dir, 'good.txt')).ref_words).toBe(5);
    expect(() => scoreWer(join(dir, 'ann'), 'M1', join(dir, 'good.txt'), { speaker: '*' })).toThrow(
      /bad speaker/,
    );
  });
});
