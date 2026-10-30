import { createInterface, type Interface } from 'node:readline';
import type { ModelPaths, ToolPaths } from './config.js';
import { WorkerFailed, WorkerProcess, type WorkerExit } from './worker.js';

export interface RawSegment {
  /** Seconds. */
  start: number;
  end: number;
  speaker: number;
}

interface Reply {
  ready?: boolean;
  progress?: number;
  segments?: [number, number, number][];
  vectors?: (number[] | null)[];
  vector?: number[] | null;
  error?: string;
}

/** Client for the scrb-sherpa worker: one request at a time, killable at any point. */
export class SherpaWorker {
  private readonly worker: WorkerProcess;
  private readonly lines: Interface;
  private readonly iterator: AsyncIterator<string>;
  private exit: WorkerExit | undefined;

  private constructor(tools: ToolPaths, models: ModelPaths, threads: number, signal?: AbortSignal) {
    this.worker = new WorkerProcess({
      name: 'scrb-sherpa',
      command: tools.sherpaSidecar,
      args: [models.segmentation, models.embedding, String(threads)],
      stdin: true,
      ...(signal ? { signal } : {}),
    });
    void this.worker.done.then((e) => (this.exit = e));
    this.worker.stdin.on('error', () => undefined);
    this.lines = createInterface({ input: this.worker.stdout });
    this.iterator = this.lines[Symbol.asyncIterator]();
  }

  static async start(
    tools: ToolPaths,
    models: ModelPaths,
    threads = 4,
    signal?: AbortSignal,
  ): Promise<SherpaWorker> {
    const w = new SherpaWorker(tools, models, threads, signal);
    await w.reply();
    return w;
  }

  private async reply(onProgress?: (fraction: number) => void): Promise<Reply> {
    for (;;) {
      const next = await this.iterator.next();
      if (next.done) throw new WorkerFailed('scrb-sherpa', this.exit ?? (await this.worker.done));
      const reply = JSON.parse(next.value) as Reply;
      if (reply.progress !== undefined) {
        onProgress?.(reply.progress);
        continue;
      }
      if (reply.error) throw new Error(`scrb-sherpa: ${reply.error}`);
      return reply;
    }
  }

  private send(text: string | Buffer): void {
    this.worker.stdin.write(text);
  }

  /** `threshold` of 2 or more is a known speaker count. */
  async diarizeFile(
    wavPath: string,
    threshold: number,
    onProgress?: (fraction: number) => void,
  ): Promise<RawSegment[]> {
    this.send(`diarize ${threshold} ${wavPath}\n`);
    return toSegments(await this.reply(onProgress));
  }

  async embedSpans(
    wavPath: string,
    spans: { start: number; end: number }[],
  ): Promise<(number[] | null)[]> {
    if (spans.length === 0) return [];
    const rows = spans.map((s) => `${s.start.toFixed(3)} ${s.end.toFixed(3)}\n`).join('');
    this.send(`embed ${spans.length} ${wavPath}\n${rows}`);
    return (await this.reply()).vectors ?? [];
  }

  async diarizeWindow(samples: Float32Array): Promise<RawSegment[]> {
    this.sendPcm('window', samples);
    return toSegments(await this.reply());
  }

  async embedPcm(samples: Float32Array): Promise<number[] | null> {
    this.sendPcm('embedpcm', samples);
    return (await this.reply()).vector ?? null;
  }

  private sendPcm(command: string, samples: Float32Array): void {
    this.send(`${command} ${samples.length}\n`);
    this.send(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  }

  /** Ends the worker; models are unloaded when the process is gone. */
  async close(): Promise<void> {
    this.worker.stdin.end();
    await this.worker.done;
    this.lines.close();
  }

  kill(): void {
    this.worker.kill();
  }
}

function toSegments(reply: Reply): RawSegment[] {
  return (reply.segments ?? []).map(([start, end, speaker]) => ({ start, end, speaker }));
}
