import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { CaptureAck, CaptureAdapter, CaptureCommand, CaptureEvent } from './index.ts';

/** Runs a platform capture helper and speaks its one-JSON-object-per-line protocol. */
export class ProcessAdapter implements CaptureAdapter {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly waiting = new Map<string, ((ack: CaptureAck) => void)[]>();
  private eventListener: (event: CaptureEvent) => void = () => undefined;

  constructor(helperPath: string, args: string[] = []) {
    this.child = spawn(helperPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
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
