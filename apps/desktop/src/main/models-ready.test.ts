import { describe, expect, it, vi } from 'vitest';
import { closeBeforeQuit } from './quit.ts';
import type { ModelDownloadProgress } from '@scrb/contracts';
import { isIdle, relaunchWhenIdle, withReadyMessage } from './models-ready.ts';

describe('isIdle', () => {
  const idle = {
    recording: { isBusy: () => false },
    finalPasses: { hasWork: () => false },
    imports: { list: () => [] },
  };
  it('is idle when nothing runs, and when the parts do not exist', () => {
    expect(isIdle(idle)).toBe(true);
    expect(isIdle({})).toBe(true);
    expect(isIdle({ recording: null, finalPasses: null, imports: null })).toBe(true);
  });
  it('is busy while recording, running a final pass or importing', () => {
    expect(isIdle({ ...idle, recording: { isBusy: () => true } })).toBe(false);
    expect(isIdle({ ...idle, finalPasses: { hasWork: () => true } })).toBe(false);
    expect(isIdle({ ...idle, imports: { list: () => [{ importId: 'a' }] } })).toBe(false);
  });
});

describe('relaunchWhenIdle', () => {
  it('relaunches, then quits (never exits), when idle', () => {
    const order: string[] = [];
    const app = {
      relaunch: vi.fn(() => order.push('relaunch')),
      quit: vi.fn(() => order.push('quit')),
      exit: vi.fn(),
    };
    expect(relaunchWhenIdle(app, () => true)).toBe(true);
    expect(order).toEqual(['relaunch', 'quit']);
    expect(app.exit).not.toHaveBeenCalled();
  });

  it('does nothing when something is running', () => {
    const app = { relaunch: vi.fn(), quit: vi.fn() };
    expect(relaunchWhenIdle(app, () => false)).toBe(false);
    expect(app.relaunch).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });

  describe('through the quit cleanup', () => {
    const wire = () => {
      const listeners: ((event: { preventDefault(): void }) => void)[] = [];
      const log: string[] = [];
      const app = {
        on: (_: 'will-quit', listener: (typeof listeners)[number]) => listeners.push(listener),
        exit: vi.fn((code: number) => log.push(`exit ${code}`)),
        relaunch: vi.fn(() => log.push('relaunch')),
        // Electron's quit raises will-quit.
        quit: vi.fn(() => {
          log.push('quit');
          listeners.forEach((listener) => listener({ preventDefault: () => undefined }));
        }),
      };
      return { app, log };
    };

    it('runs the cleanup, and exits only after it ends', async () => {
      const { app, log } = wire();
      let finish = (): void => undefined;
      closeBeforeQuit(
        app,
        () =>
          new Promise<void>((resolve) => {
            log.push('cleanup started');
            finish = () => {
              log.push('cleanup finished');
              resolve();
            };
          }),
      );
      relaunchWhenIdle(app, () => true);
      await Promise.resolve();
      expect(log).toEqual(['relaunch', 'quit', 'cleanup started']);
      finish();
      await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
      expect(log).toEqual(['relaunch', 'quit', 'cleanup started', 'cleanup finished', 'exit 0']);
    });

    it('is time-bounded, not guaranteed: a cleanup that never ends is cut off at the limit', async () => {
      const { app, log } = wire();
      closeBeforeQuit(app, () => new Promise(() => undefined), 5);
      relaunchWhenIdle(app, () => true);
      await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
      expect(log).toEqual(['relaunch', 'quit', 'exit 0']);
    });
  });
});

describe('withReadyMessage', () => {
  const event = (over: Partial<ModelDownloadProgress>): ModelDownloadProgress => ({
    role: 'liveSpeech',
    modelName: 'Live speech model',
    state: 'done',
    bytesDone: 10,
    bytesTotal: 10,
    overallBytesDone: 10,
    overallBytesTotal: 30,
    ...over,
  });
  it('adds no message before the last file, or to other states', () => {
    const early = event({});
    expect(withReadyMessage(early, true)).toBe(early);
    const running = event({ state: 'downloading', overallBytesDone: 30 });
    expect(withReadyMessage(running, true)).toBe(running);
    const failed = event({ state: 'failed', overallBytesDone: 30 });
    expect(withReadyMessage(failed, true)).toBe(failed);
  });
  it('says Scribe is restarting on the last file only when it will', () => {
    expect(withReadyMessage(event({ overallBytesDone: 30 }), true).message).toBe(
      'Models ready. Scribe is restarting.',
    );
  });
  it('asks the user to reopen when no restart will happen', () => {
    expect(withReadyMessage(event({ overallBytesDone: 30 }), false).message).toBe(
      'Models ready. Reopen Scribe to finish.',
    );
  });
});
