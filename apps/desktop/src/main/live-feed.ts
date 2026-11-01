import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { LivePipe } from '@scrb/capture';
import type { BackendEvents, EventName } from '@scrb/contracts';
import type { Library } from '@scrb/storage';
import {
  LiveAudioWorker,
  PcmFrameDecoder,
  toolsIn,
  type LiveAudioWorkerOptions,
  type LivePcmFrame,
  type ModelPaths,
} from '@scrb/transcription';
import { LiveTranscriptSink } from './live-transcript.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;
export type LiveSetup = Omit<LiveAudioWorkerOptions, 'onEvent'>;
type WorkerHandle = Pick<LiveAudioWorker, 'offer' | 'close'>;

interface HelperFeed {
  decoder: PcmFrameDecoder;
  worker: WorkerHandle | null;
  pending: LivePcmFrame[];
  startup: Promise<void>;
  closed: boolean;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A bad or missing live-only setup must never prevent opening the recording library. */
export async function readLiveSetup(
  configPath: string,
  workerEntry: string,
): Promise<LiveSetup | null> {
  try {
    if (!existsSync(workerEntry)) return null;
    const config = object(JSON.parse(await readFile(configPath, 'utf8')) as unknown);
    const tools = object(config?.tools);
    const models = object(config?.models);
    const server = tools?.whisperServer;
    const vadTool = tools?.whisperVad;
    const speech = models?.speechLive;
    const vadModel = models?.vad;
    if (
      typeof server !== 'string' ||
      !existsSync(server) ||
      typeof vadTool !== 'string' ||
      !existsSync(vadTool) ||
      typeof speech !== 'string' ||
      !existsSync(speech) ||
      typeof vadModel !== 'string' ||
      !existsSync(vadModel)
    )
      return null;
    const modelPaths: ModelPaths = {
      speechLive: speech,
      vad: vadModel,
      speechFinal: '',
      segmentation: '',
      embedding: '',
    };
    const setup: LiveSetup = {
      tools: toolsIn('', { whisperServer: server, whisperVad: vadTool }),
      models: modelPaths,
      workerArgs: [workerEntry],
    };
    const choice = object(config?.whisper);
    if (choice) {
      const whisper: NonNullable<LiveAudioWorkerOptions['whisper']> = {};
      if (
        Number.isInteger(choice.threads) &&
        Number(choice.threads) >= 1 &&
        Number(choice.threads) <= 64
      )
        whisper.threads = Number(choice.threads);
      if (
        Number.isInteger(choice.audioContext) &&
        Number(choice.audioContext) >= 1 &&
        Number(choice.audioContext) <= 4096
      )
        whisper.audioContext = Number(choice.audioContext);
      if (typeof choice.useGpu === 'boolean') whisper.useGpu = choice.useGpu;
      if (typeof choice.language === 'string' && /^[a-z-]{2,20}$/i.test(choice.language))
        whisper.language = choice.language;
      if (Object.keys(whisper).length) setup.whisper = whisper;
    }
    return setup;
  } catch {
    return null;
  }
}

/** One sink per meeting, but a fresh worker and decoder for every helper launch. */
export class LiveCaptureSession {
  private readonly sink: LiveTranscriptSink;
  private current: HelperFeed | null = null;
  private readonly cleanup = new Set<Promise<void>>();
  private closed = false;

  constructor(
    library: Library,
    meetingId: string,
    emit: Emit,
    private readonly setup: LiveSetup,
    private readonly launchWorker: (
      options: LiveAudioWorkerOptions,
    ) => Promise<WorkerHandle> = LiveAudioWorker.start,
  ) {
    this.sink = new LiveTranscriptSink(library, meetingId, emit);
  }

  startHelper(): LivePipe | undefined {
    if (this.closed) return undefined;
    if (this.current) this.closeHelper(this.current);
    const feed: HelperFeed = {
      decoder: new PcmFrameDecoder((frame) => {
        if (feed.closed) return;
        if (!feed.worker) {
          if (feed.pending.length === 20) {
            feed.pending.shift();
            this.sink.handle({ type: 'lag', lagMs: 0, queuedFrames: 1 });
          }
          feed.pending.push(frame);
        } else if (!feed.worker.offer(frame)) {
          this.sink.handle({ type: 'lag', lagMs: 0, queuedFrames: 1 });
        }
      }),
      worker: null,
      pending: [],
      startup: Promise.resolve(),
      closed: false,
    };
    this.current = feed;
    feed.startup = this.launchWorker({
      ...this.setup,
      onEvent: (event) => {
        if (!feed.closed && this.current === feed) this.sink.handle(event);
      },
    })
      .then(async (worker) => {
        feed.worker = worker;
        if (feed.closed) {
          await worker.close();
          return;
        }
        for (const frame of feed.pending) {
          if (!worker.offer(frame)) this.sink.handle({ type: 'lag', lagMs: 0, queuedFrames: 1 });
        }
        feed.pending.length = 0;
      })
      .catch(() => {
        if (!feed.closed && this.current === feed) this.sink.workerFailed();
      });
    return {
      onData: (bytes) => {
        if (feed.closed || this.current !== feed) return;
        try {
          feed.decoder.write(bytes);
        } catch {
          this.sink.workerFailed();
          this.closeHelper(feed);
        }
      },
      onEnd: () => {
        // Stop can discard an incomplete provisional frame without losing saved audio.
        this.closeHelper(feed);
      },
      onError: () => {
        if (!feed.closed && this.current === feed) this.sink.workerFailed();
        this.closeHelper(feed);
      },
    };
  }

  private closeHelper(feed: HelperFeed): void {
    if (feed.closed) return;
    feed.closed = true;
    feed.pending.length = 0;
    if (this.current === feed) this.current = null;
    const closing = feed.startup
      .then(async () => {
        await feed.worker?.close();
      })
      .catch(() => undefined);
    this.cleanup.add(closing);
    void closing.then(() => this.cleanup.delete(closing));
  }

  async stop(): Promise<void> {
    this.closed = true;
    if (this.current) this.closeHelper(this.current);
    await this.sink.stop();
    await Promise.all([...this.cleanup]);
  }
}
