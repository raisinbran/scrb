import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transcribed: string[] = [];
vi.mock('../src/whisper.js', () => ({
  transcribeWholeFile: vi.fn(async (_t: unknown, wav: string) => {
    transcribed.push(wav);
    return [];
  }),
}));
vi.mock('../src/sherpa.js', () => ({
  SherpaWorker: {
    start: async () => ({
      diarizeFile: async () => [],
      embedSpans: async () => [],
      close: async () => undefined,
      kill: () => undefined,
    }),
  },
}));

const { runFinalPass } = await import('../src/finalPass.js');

function wav(n: number, amp: number): Buffer {
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 7) * amp), 44 + i * 2);
  return b;
}
const hash = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('runFinalPass noise filter', () => {
  let dir: string;
  let mic: string;
  let meeting: string;
  beforeEach(() => {
    transcribed.length = 0;
    dir = mkdtempSync(join(tmpdir(), 'scrb-fp-nf-'));
    mic = join(dir, 'mic.wav');
    meeting = join(dir, 'meeting.wav');
    writeFileSync(mic, wav(32000, 8000));
    writeFileSync(meeting, wav(32000, 6000));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const base = () => ({
    tools: {} as never,
    models: { speechFinal: 'm', vad: 'v', segmentation: 's', embedding: 'e' } as never,
    tracks: [
      { kind: 'mic' as const, source: { wavPath: mic } },
      { kind: 'meeting' as const, source: { wavPath: meeting } },
    ],
    workDir: join(dir, 'work'),
  });

  it('is off by default: both tracks are transcribed as saved', async () => {
    await runFinalPass(base());
    expect(transcribed).toEqual([mic, meeting]);
  });

  it('falls back to the unfiltered mic when the helper fails, leaving originals alone and removing scratch', async () => {
    const before = [hash(mic), hash(meeting)];
    const results: { filtered: boolean; bypassReason?: string }[] = [];
    await runFinalPass({
      ...base(),
      noiseFilter: {
        helperPath: process.execPath,
        settings: { noiseSuppression: 'moderate', echoCancellation: true, autoGain: false },
        onResult: (r) => results.push(r),
      },
    });
    // process.execPath rejects the filter arguments, so the pass falls back to the unfiltered mic.
    expect(results).toEqual([{ filtered: false, bypassReason: 'helper-failed' }]);
    expect(transcribed).toEqual([mic, meeting]);
    expect([hash(mic), hash(meeting)]).toEqual(before);
    expect(existsSync(join(dir, 'work'))).toBe(false);
  });

  it('bypasses without a helper and never touches the meeting track', async () => {
    const results: { filtered: boolean; bypassReason?: string }[] = [];
    await runFinalPass({
      ...base(),
      noiseFilter: {
        helperPath: undefined,
        settings: { noiseSuppression: 'high', echoCancellation: true, autoGain: false },
        onResult: (r) => results.push(r),
      },
    });
    expect(results).toEqual([{ filtered: false, bypassReason: 'helper-missing' }]);
    expect(transcribed).toEqual([mic, meeting]);
  });

  const exe =
    process.env['SCRB_APM_FILTER'] ??
    join(
      __dirname,
      '../../../native/apm-filter/build/scrb-apm-filter' +
        (process.platform === 'win32' ? '.exe' : ''),
    );
  it.skipIf(!existsSync(exe))(
    'with the real helper, recognition reads a scratch copy and the originals stay byte-identical',
    async () => {
      const before = [hash(mic), hash(meeting)];
      const results: { filtered: boolean }[] = [];
      await runFinalPass({
        ...base(),
        noiseFilter: {
          helperPath: exe,
          settings: { noiseSuppression: 'moderate', echoCancellation: true, autoGain: false },
          onResult: (r) => results.push(r),
        },
      });
      expect(results).toEqual([{ filtered: true }]);
      expect(transcribed[0]).not.toBe(mic);
      expect(transcribed[0]!.startsWith(join(dir, 'work'))).toBe(true);
      expect(transcribed[1]).toBe(meeting);
      expect([hash(mic), hash(meeting)]).toEqual(before);
      expect(existsSync(join(dir, 'work'))).toBe(false);
    },
  );
});
