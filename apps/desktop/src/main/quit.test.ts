import { describe, expect, it, vi } from 'vitest';
import { closeBeforeQuit } from './quit.ts';

function fakeApp() {
  const listeners: ((event: { preventDefault(): void }) => void)[] = [];
  const preventDefault = vi.fn();
  return {
    app: {
      on: (_: 'will-quit', listener: (typeof listeners)[number]) => listeners.push(listener),
      exit: vi.fn(),
    },
    quit: () => listeners.forEach((listener) => listener({ preventDefault })),
    preventDefault,
  };
}

describe('closeBeforeQuit', () => {
  it('holds the quit until close ends, and closes once', async () => {
    const { app, quit, preventDefault } = fakeApp();
    let done = (): void => undefined;
    const close = vi.fn(() => new Promise<void>((resolve) => (done = resolve)));
    closeBeforeQuit(app, close);
    quit();
    quit();
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(app.exit).not.toHaveBeenCalled();
    done();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
  });

  it('exits when close fails', async () => {
    const { app, quit } = fakeApp();
    closeBeforeQuit(app, () => Promise.reject(new Error('close failed')));
    quit();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
  });

  it('exits at the time limit when close never ends', async () => {
    const { app, quit } = fakeApp();
    closeBeforeQuit(app, () => new Promise(() => undefined), 5);
    quit();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
  });
});
