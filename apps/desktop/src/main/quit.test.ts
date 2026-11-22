import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  closeBeforeQuit,
  createSafeQuitGuard,
  createStartupActivity,
  shouldGuardLastMainWindowClose,
  type QuitActivity,
} from './quit.ts';

const idle: QuitActivity = {
  recording: false,
  finalPass: false,
  importing: false,
  recovering: false,
};

function event() {
  return { preventDefault: vi.fn() };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('createSafeQuitGuard', () => {
  it.each([
    ['recording', { ...idle, recording: true }],
    ['final transcription', { ...idle, finalPass: true }],
    ['import', { ...idle, importing: true }],
    ['startup recovery', { ...idle, recovering: true }],
  ])('vetoes quit while %s is active and Keep preserves cleanup state', async (_label, state) => {
    const response = deferred<boolean>();
    const confirm = vi.fn(() => response.promise);
    const quit = vi.fn();
    const cleanup = vi.fn();
    const guard = createSafeQuitGuard({ activity: () => state, confirm, quit });
    const request = event();
    if (guard.beforeQuit(request)) cleanup();

    expect(request.preventDefault).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();

    response.resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(quit).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not prompt or veto an idle explicit quit', () => {
    const confirm = vi.fn(async () => true);
    const guard = createSafeQuitGuard({ activity: () => idle, confirm, quit: vi.fn() });
    const request = event();

    expect(guard.beforeQuit(request)).toBe(true);
    expect(request.preventDefault).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('preserves windows and runs cleanup only after a confirmed busy quit', async () => {
    const confirm = vi.fn(async () => true);
    const request = event();
    const cleanup = vi.fn();
    const quit = vi.fn();
    const guard = createSafeQuitGuard({
      activity: () => ({ ...idle, recording: true }),
      confirm,
      quit,
    });

    expect(guard.beforeQuit(request)).toBe(false);
    expect(request.preventDefault).toHaveBeenCalledOnce();
    expect(cleanup).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
    if (guard.beforeQuit(event())) cleanup();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('deduplicates repeated quit requests while the native prompt is open', async () => {
    const response = deferred<boolean>();
    const confirm = vi.fn(() => response.promise);
    const quit = vi.fn();
    const guard = createSafeQuitGuard({
      activity: () => ({ ...idle, finalPass: true }),
      confirm,
      quit,
    });
    const first = event();
    const repeated = event();

    guard.beforeQuit(first);
    guard.beforeQuit(repeated);
    guard.lastMainWindowClose(event());
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(repeated.preventDefault).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();

    response.resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(quit).not.toHaveBeenCalled();
  });

  it('re-prompts against a changed busy snapshot before approving quit', async () => {
    let current = { ...idle, recording: true };
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const confirm = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const quit = vi.fn();
    const guard = createSafeQuitGuard({ activity: () => current, confirm, quit });
    guard.beforeQuit(event());

    current = { ...idle, finalPass: true };
    first.resolve(true);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(confirm.mock.calls[1]?.[0]).toEqual(current);
    expect(quit).not.toHaveBeenCalled();

    second.resolve(true);
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
  });

  it('revalidates an activity that finishes while confirmation is open', async () => {
    let current = { ...idle, importing: true };
    const confirm = vi.fn(async () => {
      current = idle;
      return true;
    });
    const quit = vi.fn();
    const guard = createSafeQuitGuard({ activity: () => current, confirm, quit });
    guard.beforeQuit(event());

    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('does not schedule a recovery relaunch until quit is approved', async () => {
    const response = deferred<boolean>();
    const confirm = vi.fn(() => response.promise);
    const relaunch = vi.fn();
    const quit = vi.fn();
    const guard = createSafeQuitGuard({
      activity: () => ({ ...idle, finalPass: true }),
      confirm,
      quit,
    });

    guard.requestQuit(relaunch);
    expect(confirm).toHaveBeenCalledOnce();
    expect(relaunch).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();

    response.resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(relaunch).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });

  it('runs an approved recovery relaunch before the guarded quit', () => {
    const order: string[] = [];
    const guard = createSafeQuitGuard({
      activity: () => idle,
      confirm: vi.fn(async () => true),
      quit: () => order.push('quit'),
    });

    guard.requestQuit(() => order.push('relaunch'));
    expect(order).toEqual(['relaunch', 'quit']);
  });

  it('fails closed if the native confirmation cannot be shown', async () => {
    const guard = createSafeQuitGuard({
      activity: () => ({ ...idle, recording: true }),
      confirm: async () => {
        throw new Error('dialog unavailable');
      },
      quit: vi.fn(),
    });
    const request = event();

    expect(guard.beforeQuit(request)).toBe(false);
    await Promise.resolve();
    expect(request.preventDefault).toHaveBeenCalledOnce();
  });

  it('routes a Windows last-window close through quit before destroying its window', async () => {
    const confirm = vi.fn(async () => false);
    const quit = vi.fn();
    const guard = createSafeQuitGuard({
      activity: () => ({ ...idle, finalPass: true }),
      confirm,
      quit,
    });
    const close = event();

    guard.lastMainWindowClose(close);
    expect(close.preventDefault).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    expect(shouldGuardLastMainWindowClose('win32', true)).toBe(true);
    expect(shouldGuardLastMainWindowClose('win32', false)).toBe(false);
    expect(shouldGuardLastMainWindowClose('darwin', true)).toBe(false);
  });

  it('routes an idle Windows last-window close without showing confirmation', () => {
    const confirm = vi.fn(async () => true);
    const quit = vi.fn();
    const guard = createSafeQuitGuard({ activity: () => idle, confirm, quit });
    const close = event();

    guard.lastMainWindowClose(close);
    expect(close.preventDefault).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledOnce();
    expect(guard.beforeQuit(event())).toBe(true);
  });

  it('wires the guard before mini cleanup and reports backend recovery and worker state', () => {
    const mainSource = readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
    const backendSource = readFileSync(path.join(__dirname, 'backend.ts'), 'utf8');

    expect(mainSource).toMatch(
      /app\.on\('before-quit', \(event\) => \{\s*if \(!quitGuard\.beforeQuit\(event\)\) return;\s*for \(const window of miniWindows\)/,
    );
    expect(mainSource).toMatch(
      /shouldGuardLastMainWindowClose\(process\.platform, mainWindows\(\)\.length === 1\)/,
    );
    expect(mainSource).toContain('quitGuard.lastMainWindowClose(event);');
    expect(mainSource).toContain('quitGuard.requestQuit(() => app.relaunch());');
    expect(mainSource).not.toContain('app.exit(0);');
    expect(mainSource).toContain(
      'closeBeforeQuit(app, async () => (await backendPromise).close());',
    );
    expect(backendSource).toMatch(
      /const startupActivity = createStartupActivity\(\(\) => \(\{[\s\S]*?recording: recording\?\.isBusy\(\)[\s\S]*?finalPass: finalPasses\?\.hasWork\(\)[\s\S]*?importing: \(imports\?\.list\(\)\.length \?\? 0[\s\S]*?recovering,/,
    );
    // The busy activity reader must be registered before any index/library operation.
    expect(backendSource).toMatch(
      /onCriticalActivity\?\.\(startupActivity\.read\);[\s\S]*?try \{[\s\S]*?await openBackendLibrary\(/,
    );
    // Also release the startup flag when the blocked-library fallback succeeds or throws.
    expect(backendSource).toMatch(
      /\} finally \{\s*\/\/ Never expose a false idle gap[^\n]*\s*startupActivity\.finish\(\);/,
    );
    expect(backendSource).toMatch(/recovering = true;\s*try \{\s*await recoverInterrupted/);
    expect(backendSource).toMatch(/recovering = true;\s*try \{\s*await resumeFinalPasses/);
    expect(backendSource).toMatch(
      /recovering = true;\s*try \{\s*await imports\.recoverInterrupted/,
    );
  });
});

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
