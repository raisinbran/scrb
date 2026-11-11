import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { CaptureAck, CaptureAdapter, CaptureCommand, CaptureEvent } from './index.ts';

export interface LivePipe {
  onData(bytes: Buffer): void;
  onEnd(): void;
  onError(): void;
}

/** Runs a platform capture helper and speaks its one-JSON-object-per-line protocol. */
export class ProcessAdapter implements CaptureAdapter {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly waiting = new Map<string, ((ack: CaptureAck) => void)[]>();
  private eventListener: (event: CaptureEvent) => void = () => undefined;
  private stopSent = false;

  constructor(helperPath: string, args: string[] = [], live?: LivePipe) {
    const env = { ...process.env };
    // Only an opted-in macOS helper gets a live-audio descriptor.
    delete env.SCRB_LIVE_FD;
    if (live) env.SCRB_LIVE_FD = '3';
    this.child = spawn(helperPath, args, {
      stdio: live ? ['pipe', 'pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
      env,
    });
    if (live) {
      const stream = this.child.stdio[3];
      let reported = false;
      let closing: ReturnType<typeof setTimeout> | undefined;
      const report = (kind: 'end' | 'error') => {
        if (reported) return;
        reported = true;
        clearTimeout(closing);
        try {
          if (kind === 'end') live.onEnd();
          else live.onError();
        } catch {
          // Live consumers must never affect the durable helper.
        }
      };
      const expected = () =>
        this.stopSent || this.child.exitCode !== null || this.child.signalCode !== null;
      const classifyClose = () => {
        if (expected()) report('end');
        else {
          // A helper exit may reach us after its live descriptor closes.
          closing ??= setTimeout(() => report(expected() ? 'end' : 'error'), 1000);
          closing.unref();
        }
      };
      this.child.once('exit', () => {
        if (closing) report('end');
      });
      if (stream) {
        stream.on('data', (bytes: Buffer) => {
          try {
            live.onData(bytes);
          } catch {
            report('error');
          }
        });
        stream.once('end', classifyClose);
        stream.once('error', classifyClose);
      } else report('error');
    }
    this.child.on('error', () => undefined);
    this.child.stdin.on('error', () => undefined);
    createInterface({ input: this.child.stdout }).on('line', (line) => this.receive(line));
  }

  private receive(line: string): void {
    let message: { type?: string; id?: string; event?: string } & Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === 'ack' && message.id !== undefined) {
      const replies = this.waiting.get(message.id) ?? [];
      this.waiting.delete(message.id);
      for (const reply of replies) reply(message as unknown as CaptureAck);
    } else if (message.type === 'event') {
      this.eventListener({ ...message, type: message.event } as unknown as CaptureEvent);
    }
  }

  send(id: string, command: CaptureCommand): Promise<CaptureAck> {
    return new Promise((resolve) => {
      if (command.name === 'stop') this.stopSent = true;
      const replies = this.waiting.get(id) ?? [];
      this.waiting.set(id, [...replies, resolve]);
      const wire =
        'source' in command && command.source === 'wholeComputer'
          ? { ...command, source: [] }
          : command;
      this.child.stdin.write(`${JSON.stringify({ id, ...wire })}\n`);
    });
  }

  onEvent(listener: (event: CaptureEvent) => void): void {
    this.eventListener = listener;
  }

  onExit(listener: () => void): void {
    this.child.once('exit', listener);
    // A process that never launched has no pid and emits `error` instead of `exit`.
    this.child.once('error', () => {
      if (this.child.pid === undefined) listener();
    });
  }

  kill(): void {
    this.child.kill('SIGKILL');
  }
}
