import { readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { pcmToWav } from './audio.js';
import type { ToolPaths } from './config.js';
import { WorkerFailed, WorkerProcess, runToCompletion, type WorkerExit } from './worker.js';

export interface WhisperWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface WholeFileOptions {
  model: string;
  vadModel: string;
  threads?: number;
  language?: string;
  useGpu?: boolean;
  /** Vocabulary hint; carried across segments because `-mc 0` drops context. */
  prompt?: string;
  signal?: AbortSignal;
  onFraction?: (fraction: number) => void;
}

/**
 * The proven final-pass settings: Silero VAD segments and no text conditioning
 * (`-mc 0`), without which turbo loops or skips.  `-ml 1 -sow` gives one result
 * per word because only segment times are mapped back through the VAD; token
 * times in the JSON stay in VAD-trimmed time.
 */
export function wholeFileArgs(wavPath: string, outBase: string, o: WholeFileOptions): string[] {
  const args = ['-m', o.model, '-f', wavPath, '-t', String(o.threads ?? 4),
    '-l', o.language ?? 'en', '--vad', '--vad-model', o.vadModel, '-mc', '0',
    '-ml', '1', '-sow', '-ojf', '-of', outBase, '-np', '-pp'];
  if (o.useGpu === false) args.push('-ng');
  if (o.prompt) args.push('--prompt', o.prompt, '--carry-initial-prompt');
  return args;
}

interface RawJson {
  transcription?: {
    offsets?: { from?: number; to?: number };
    text?: string;
    tokens?: { text?: string; p?: number }[];
  }[];
}

/** Sound tags such as [BLANK_AUDIO] are not spoken words. */
const SOUND_TAG = /^[[(].*[\])]$/;

export function parseWords(json: string): WhisperWord[] {
  const raw = JSON.parse(json) as RawJson;
  const words: WhisperWord[] = [];
  for (const seg of raw.transcription ?? []) {
    const text = (seg.text ?? '').trim();
    if (!text || SOUND_TAG.test(text)) continue;
    const spoken = (seg.tokens ?? []).filter((t) => t.text && !t.text.startsWith('[_'));
    const confidence = spoken.length
      ? spoken.reduce((sum, t) => sum + (t.p ?? 0), 0) / spoken.length
      : 0;
    words.push({
      text,
      startMs: seg.offsets?.from ?? 0,
      endMs: seg.offsets?.to ?? 0,
      confidence: Math.round(confidence * 1000) / 1000,
    });
  }
  return words;
}

export async function transcribeWholeFile(
  tools: ToolPaths,
  wavPath: string,
  workDir: string,
  options: WholeFileOptions,
): Promise<WhisperWord[]> {
  const outBase = join(workDir, 'whisper-out');
  const worker = new WorkerProcess({
    name: 'whisper-cli',
    command: tools.whisperCli,
    args: wholeFileArgs(wavPath, outBase, options),
    ...(options.signal ? { signal: options.signal } : {}),
    onStderrLine: (line) => {
      const m = /progress =\s*(\d+)%/.exec(line);
      if (m) options.onFraction?.(Number(m[1]) / 100);
    },
  });
  worker.stdout.resume();
  const exit = await worker.done;
  if (exit.code !== 0) throw new WorkerFailed('whisper-cli', exit);
  const path = `${outBase}.json`;
  const words = parseWords(await readFile(path, 'utf8'));
  await rm(path, { force: true });
  return words;
}

export interface VadSpan {
  startMs: number;
  endMs: number;
}

export function parseVadSegments(output: string): VadSpan[] {
  const out: VadSpan[] = [];
  for (const m of output.matchAll(/start = ([\d.]+), end = ([\d.]+)/g)) {
    // whisper-vad-speech-segments reports centiseconds.
    out.push({ startMs: Number(m[1]) * 10, endMs: Number(m[2]) * 10 });
  }
  return out;
}

/** Runs Silero VAD on a WAV; 300 ms silence split as in the Phase 0 runs. */
export async function detectSpeech(
  tools: ToolPaths,
  vadModel: string,
  wavPath: string,
  signal?: AbortSignal,
): Promise<VadSpan[]> {
  const out = await runToCompletion({
    name: 'whisper-vad',
    command: tools.whisperVad,
    args: ['-f', wavPath, '-vm', vadModel, '-vsd', '300', '-t', '1'],
    ...(signal ? { signal } : {}),
  });
  return parseVadSegments(out);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const address = s.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      s.close(() => resolve(port));
    });
  });
}

export interface LiveWhisperOptions {
  model: string;
  threads?: number;
  language?: string;
  useGpu?: boolean;
  /** 768 on CPU-only machines, where full context cannot keep up. */
  audioContext?: number;
  startTimeoutMs?: number;
}

/** whisper-server on loopback: one model kept loaded for short live segments. */
export class LiveWhisper {
  private constructor(
    private readonly worker: WorkerProcess,
    private readonly port: number,
  ) {}

  static async start(tools: ToolPaths, o: LiveWhisperOptions): Promise<LiveWhisper> {
    const port = await freePort();
    const args = ['-m', o.model, '--host', '127.0.0.1', '--port', String(port),
      '-t', String(o.threads ?? 4), '-l', o.language ?? 'en', '-mc', '0', '-nt'];
    if (o.audioContext) args.push('-ac', String(o.audioContext));
    if (o.useGpu === false) args.push('-ng');
    const worker = new WorkerProcess({ name: 'whisper-server', command: tools.whisperServer, args });
    worker.stdout.resume();
    const live = new LiveWhisper(worker, port);
    await live.waitReady(o.startTimeoutMs ?? 60_000);
    return live;
  }

  get exited(): Promise<WorkerExit> {
    return this.worker.done;
  }

  private async waitReady(timeoutMs: number): Promise<void> {
    let exit: WorkerExit | undefined;
    void this.worker.done.then((e) => (exit = e));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (exit) throw new WorkerFailed('whisper-server', exit);
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`);
        if (res.ok) return;
      } catch {
        // Not listening yet.
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    this.worker.kill();
    throw new WorkerFailed('whisper-server', await this.worker.done);
  }

  async transcribe(samples: Int16Array, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.set('file', new Blob([pcmToWav(samples)], { type: 'audio/wav' }), 'segment.wav');
    form.set('response_format', 'json');
    const res = await fetch(`http://127.0.0.1:${this.port}/inference`, {
      method: 'POST',
      body: form,
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`whisper-server returned ${res.status}`);
    const body = (await res.json()) as { text?: string };
    return (body.text ?? '').trim();
  }

  kill(): void {
    this.worker.kill();
  }
}
