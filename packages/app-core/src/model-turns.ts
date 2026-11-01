/** Only one large model is loaded at a time after Stop, whichever job asks for it. */
export class ModelTurns {
  private tail: Promise<unknown> = Promise.resolve();

  wrap<I extends { signal: AbortSignal }, O>(
    run: (input: I) => Promise<O>,
  ): (input: I) => Promise<O> {
    return (input) => this.take(input.signal, () => run(input));
  }

  private async take<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let finish = (): void => undefined;
    const mine = new Promise<void>((resolve) => {
      finish = resolve;
    });
    // A job cancelled while waiting must not let the next one overlap the job still running.
    this.tail = Promise.all([previous, mine]);
    try {
      await Promise.race([previous, aborted(signal)]);
      signal.throwIfAborted();
      return await work();
    } finally {
      finish();
    }
  }
}

function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });
}
