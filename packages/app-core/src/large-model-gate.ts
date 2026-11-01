export class LargeModelGate {
  private busy = false;
  private readonly waiting: Array<{
    resolve: () => void;
    reject: (reason: Error) => void;
    signal?: AbortSignal;
  }> = [];

  /** A job owns the model slot until its worker settles, even after cancellation. */
  async run<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new Error('Model job cancelled');
    if (this.busy) {
      await new Promise<void>((resolve, reject) => {
        const waiter = {
          resolve: () => {
            signal?.removeEventListener('abort', abort);
            resolve();
          },
          reject,
          ...(signal ? { signal } : {}),
        };
        const abort = () => {
          const index = this.waiting.indexOf(waiter);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new Error('Model job cancelled'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        this.waiting.push(waiter);
      });
    } else {
      this.busy = true;
    }
    try {
      if (signal?.aborted) throw new Error('Model job cancelled');
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next.resolve();
      else this.busy = false;
    }
  }
}
