import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import type { LivePipe } from '@scrb/capture';

interface Endpoint {
  name: string;
  server: Server;
  socket: Socket | null;
  sink: LivePipe | null;
  expectedClose: () => boolean;
  closed: boolean;
  closeTimer?: ReturnType<typeof setTimeout>;
}

/** Prebind one independent pipe per possible native helper launch. */
export class WindowsLivePipePool {
  private readonly entries: Endpoint[] = [];
  private next = 0;
  private closed = false;
  private readonly count: number;
  private readonly makeName: () => string;

  constructor(
    count: number,
    makeName: () => string = () => String.raw`\\.\pipe\scrb-live-${randomUUID()}`,
  ) {
    this.count = count;
    this.makeName = makeName;
  }

  async prepare(): Promise<void> {
    try {
      for (let i = 0; i < this.count; i++) {
        const endpoint: Endpoint = {
          name: this.makeName(),
          server: createServer(),
          socket: null,
          sink: null,
          expectedClose: () => false,
          closed: false,
        };
        endpoint.server.on('connection', (socket) => this.accept(endpoint, socket));
        endpoint.server.on('error', () => {
          this.notify(endpoint, 'onError');
          this.release(endpoint);
        });
        await new Promise<void>((resolve, reject) => {
          endpoint.server.once('error', reject);
          endpoint.server.listen(endpoint.name, () => {
            endpoint.server.off('error', reject);
            resolve();
          });
        });
        this.entries.push(endpoint);
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }

  hasNext(): boolean {
    return !this.closed && !!this.entries[this.next] && !this.entries[this.next]!.closed;
  }

  take(sink: LivePipe, expectedClose: () => boolean = () => false): string | undefined {
    if (!this.hasNext()) return undefined;
    const endpoint = this.entries[this.next++]!;
    endpoint.sink = sink;
    endpoint.expectedClose = expectedClose;
    return endpoint.name;
  }

  private accept(endpoint: Endpoint, socket: Socket): void {
    if (endpoint.closed || !endpoint.sink || endpoint.socket) {
      socket.destroy();
      return;
    }
    endpoint.socket = socket;
    endpoint.server.close();
    let ended = false;
    const notifyClose = (kind: 'onEnd' | 'onError') => {
      if (endpoint.closed) return;
      this.notify(endpoint, kind);
      this.release(endpoint);
    };
    const classifyClose = () => {
      if (endpoint.closed || ended) return;
      ended = true;
      if (endpoint.expectedClose()) notifyClose('onEnd');
      else {
        // Let the helper's exit event arrive before treating a closed live-only pipe as failed.
        endpoint.closeTimer = setTimeout(() => {
          notifyClose(endpoint.expectedClose() ? 'onEnd' : 'onError');
        }, 1000);
        endpoint.closeTimer.unref();
      }
    };
    socket.on('data', (bytes) => {
      if (endpoint.closed) return;
      try {
        endpoint.sink?.onData(bytes);
      } catch {
        this.notify(endpoint, 'onError');
        this.release(endpoint);
      }
    });
    socket.once('end', classifyClose);
    socket.once('error', classifyClose);
    socket.once('close', classifyClose);
  }

  private notify(endpoint: Endpoint, kind: 'onEnd' | 'onError'): void {
    if (endpoint.closed) return;
    try {
      endpoint.sink?.[kind]();
    } catch {
      // A live-only consumer cannot fail the capture process.
    }
  }

  private release(endpoint: Endpoint): void {
    if (endpoint.closed) return;
    endpoint.closed = true;
    clearTimeout(endpoint.closeTimer);
    endpoint.socket?.destroy();
    if (endpoint.server.listening) endpoint.server.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const endpoint of this.entries) this.release(endpoint);
  }
}
