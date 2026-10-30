import { randomUUID } from 'node:crypto';
import type { CaptureAck, CaptureCommand, HelperApp, HelperMic } from './index.ts';
import { ProcessAdapter } from './process-adapter.ts';

const LIST_TIMEOUT_MS = 5000;

/** Each list runs in its own short-lived helper, so it can never disturb a recording's worker. */
async function ask(helperPath: string, command: CaptureCommand, timeoutMs: number) {
  const adapter = new ProcessAdapter(helperPath);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // `send` waits for ever, so a helper that dies or hangs has to end the wait here.
  const failed = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The capture helper did not answer.')), timeoutMs);
    adapter.onExit(() => reject(new Error('The capture helper stopped.')));
  });
  try {
    const ack: CaptureAck = await Promise.race([adapter.send(randomUUID(), command), failed]);
    if (!ack.ok) throw new Error(ack.error ?? 'The capture helper refused.');
    return ack;
  } finally {
    clearTimeout(timer);
    adapter.kill();
  }
}

export async function readMics(
  helperPath: string,
  timeoutMs = LIST_TIMEOUT_MS,
): Promise<HelperMic[]> {
  return (await ask(helperPath, { name: 'listMics' }, timeoutMs)).mics ?? [];
}

export async function readApps(
  helperPath: string,
  include: string[] = [],
  timeoutMs = LIST_TIMEOUT_MS,
): Promise<HelperApp[]> {
  return (await ask(helperPath, { name: 'listApps', include }, timeoutMs)).apps ?? [];
}
