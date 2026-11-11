import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pcmToWav } from './audio.js';
import { LivePcmEngine } from './livePcmEngine.js';
import { PcmFrameDecoder } from './livePcmProtocol.js';
import { requestLiveWords, type VadSpan } from './whisper.js';

/** PCM travels on stdin; only bounded transcript/control metadata travels on Node IPC. */
const send = (message: object): void => {
  if (process.connected) process.send!(message, () => undefined);
};
let engine: LivePcmEngine | undefined;
let decoder: PcmFrameDecoder | undefined;
let busy = false;
let stopped = false;
let vad: ((spans: VadSpan[]) => void) | undefined;
const abort = new AbortController();

function stop(): void {
  if (stopped) return;
  stopped = true;
  abort.abort();
  engine?.close();
  process.stdin.destroy();
  process.disconnect?.();
}

process.on('message', (raw: unknown) => {
  if (stopped || !raw || typeof raw !== 'object') return;
  const message = raw as Record<string, unknown>;
  if (message.type === 'vad' && vad) {
    const resolve = vad;
    vad = undefined;
    resolve(message.spans as VadSpan[]);
  } else if (
    message.type === 'init' &&
    !engine &&
    typeof message.workDir === 'string' &&
    Number.isInteger(message.port) &&
    Number(message.port) > 0 &&
    Number(message.port) < 65536
  ) {
    const dir = message.workDir;
    engine = new LivePcmEngine(
      {
        detect: async (track, samples) => {
          await writeFile(join(dir, `vad-${track}.wav`), pcmToWav(samples));
          if (stopped) throw new Error('Live worker stopped');
          return new Promise<VadSpan[]>((resolve) => {
            vad = resolve;
            send({ type: 'vad', track });
          });
        },
        transcribe: (samples) => requestLiveWords(Number(message.port), samples, abort.signal),
      },
      (segment) => send({ type: 'segment', segment }),
      (gap) => send({ type: 'skipped', gap }),
    );
    decoder = new PcmFrameDecoder((frame) => {
      if (busy) throw new Error('Live input credit exceeded');
      busy = true;
      process.stdin.pause();
      void engine!
        .push(frame)
        .then(() => {
          if (!stopped) {
            busy = false;
            send({
              type: 'ack',
              track: frame.track,
              sequence: frame.sequence,
              bufferedStartNs: engine!.pendingStartNs(frame.track),
            });
            process.stdin.resume();
          }
        })
        .catch(() => {
          send({ type: 'failed' });
          stop();
        });
    });
    send({ type: 'ready' });
  }
});
process.stdin.on('data', (bytes: Buffer) => {
  try {
    if (!decoder) throw new Error('Live input before init');
    decoder.write(bytes);
  } catch {
    send({ type: 'failed' });
    stop();
  }
});
process.stdin.on('end', () => {
  try {
    decoder?.end();
  } catch {
    /* No live tail is saved. */
  }
  stop();
});
process.on('disconnect', stop);
