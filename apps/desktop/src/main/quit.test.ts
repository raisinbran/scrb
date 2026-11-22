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

/**
 * Exercise the same observable ordering used by Electron: Windows last-main-window close,
 * before-quit veto, mini-window cleanup, will-quit, and bounded backend close.
 * The app/window emitters are fakes; this does not claim an installed GUI test.
 */
function fakeElectronLifecycle(
  platform: 'win32' | 'darwin',
  activity: () => QuitActivity,
  confirm: (current: QuitActivity) => Promise<boolean>,
  close: () => Promise<void>,
  limitMs = 15_000,
) {
  type QuitEvent = { preventDefault(): void };
  type QuitName = 'before-quit' | 'will-quit';
  const listeners: Record<QuitName, ((request: QuitEvent) => void)[]> = {
    'before-quit': [],
    'will-quit': [],
  };
  const order: string[] = [];
  let mainDestroyed = false;
  const destroyMain = vi.fn(() => {
    mainDestroyed = true;
    order.push('destroy-main');
  });
  const destroyMini = vi.fn(() => order.push('destroy-mini'));
  const app = {
    on: (name: QuitName, listener: (request: QuitEvent) => void): void => {
      listeners[name].push(listener);
    },
    exit: vi.fn((code: number) => order.push(`exit-${code}`)),
    quit: vi.fn(() => {
      order.push('app.quit');
      const before = event();
      order.push('before-quit');
      for (const listener of listeners['before-quit']) listener(before);
      if (before.preventDefault.mock.calls.length > 0) return;
      if (!mainDestroyed) {
        const closeRequest = event();
        if (shouldGuardLastMainWindowClose(platform, true)) {
          guard.lastMainWindowClose(closeRequest);
        }
        if (closeRequest.preventDefault.mock.calls.length > 0) return;
        destroyMain();
      }
      const will = event();
      order.push('will-quit');
      for (const listener of listeners['will-quit']) listener(will);
    }),
  };
  const guard: ReturnType<typeof createSafeQuitGuard> = createSafeQuitGuard({
    activity,
    confirm,
    quit: () => app.quit(),
  });
  app.on('before-quit', (request) => {
    if (guard.beforeQuit(request)) destroyMini();
  });
  closeBeforeQuit(
    app,
    async () => {
      order.push('backend.close');
      await close();
    },
    limitMs,
  );
  const closeMain = () => {
    const request = event();
    if (shouldGuardLastMainWindowClose(platform, true)) {
      guard.lastMainWindowClose(request);
    }
    if (request.preventDefault.mock.calls.length === 0) destroyMain();
    return request;
  };
  return { app, closeMain, destroyMain, destroyMini, order };
}

describe('integrated fake Electron quit lifecycle', () => {
  it('holds pending library opening and retains both windows when Keep is chosen', async () => {
    const libraryOpened = deferred<void>();
    const startup = createStartupActivity(() => idle);
    const opening = libraryOpened.promise.finally(() => startup.finish());
    const confirm = vi.fn(async () => false);
    const close = vi.fn(async () => opening);
    const lifecycle = fakeElectronLifecycle('win32', startup.read, confirm, close);

    expect(startup.read()).toEqual({ ...idle, recovering: true });
    const request = lifecycle.closeMain();
    expect(request.preventDefault).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith({ ...idle, recovering: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(lifecycle.app.quit).not.toHaveBeenCalled();
    expect(lifecycle.destroyMain).not.toHaveBeenCalled();
    expect(lifecycle.destroyMini).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(lifecycle.app.exit).not.toHaveBeenCalled();
    expect(startup.read().recovering).toBe(true);

    libraryOpened.resolve();
    await opening;
    expect(startup.read()).toEqual(idle);
  });

  it('confirms pending library opening before mini cleanup and waits for bounded shutdown', async () => {
    const opening = deferred<{ close(): Promise<void> }>();
    const startup = createStartupActivity(() => idle);
    const backendPromise = opening.promise.finally(() => startup.finish());
    const closedBackend = vi.fn(async () => undefined);
    const close = vi.fn(async () => (await backendPromise).close());
    const confirm = vi.fn(async () => true);
    const lifecycle = fakeElectronLifecycle('win32', startup.read, confirm, close);

    const request = lifecycle.closeMain();
    expect(request.preventDefault).toHaveBeenCalledOnce();
    expect(lifecycle.destroyMini).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith({ ...idle, recovering: true });
    expect(lifecycle.destroyMini).toHaveBeenCalledOnce();
    expect(lifecycle.destroyMain).toHaveBeenCalledOnce();
    expect(lifecycle.app.exit).not.toHaveBeenCalled();
    expect(lifecycle.order.slice(0, 6)).toEqual([
      'app.quit',
      'before-quit',
      'destroy-mini',
      'destroy-main',
      'will-quit',
      'backend.close',
    ]);

    opening.resolve({ close: closedBackend });
    await vi.waitFor(() => expect(lifecycle.app.exit).toHaveBeenCalledWith(0));
    expect(closedBackend).toHaveBeenCalledOnce();
    expect(startup.read()).toEqual(idle);
    expect(lifecycle.order.at(-1)).toBe('exit-0');
  });

  it('keeps a macOS ordinary close separate from a vetoed Cmd+Q', async () => {
    const confirm = vi.fn(async () => false);
    const close = vi.fn(async () => undefined);
    const lifecycle = fakeElectronLifecycle(
      'darwin',
      () => ({ ...idle, finalPass: true }),
      confirm,
      close,
    );
    const request = lifecycle.closeMain();
    expect(request.preventDefault).not.toHaveBeenCalled();
    expect(lifecycle.destroyMain).toHaveBeenCalledOnce();
    expect(lifecycle.app.quit).not.toHaveBeenCalled();
    expect(lifecycle.destroyMini).not.toHaveBeenCalled();

    lifecycle.app.quit();
    expect(confirm).toHaveBeenCalledWith({ ...idle, finalPass: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(lifecycle.destroyMini).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(lifecycle.app.exit).not.toHaveBeenCalled();
  });

  it('preserves the existing bounded will-quit shutdown if backend open never resolves', async () => {
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const lifecycle = fakeElectronLifecycle(
      'win32',
      () => idle,
      async () => true,
      close,
      5,
    );
    lifecycle.app.quit();
    expect(lifecycle.destroyMini).toHaveBeenCalledOnce();
    expect(lifecycle.destroyMain).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(lifecycle.app.exit).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps startup busy through other recovery phases, then reports live worker state', () => {
    let work = { ...idle, finalPass: true };
    const startup = createStartupActivity(() => work);
    expect(startup.read()).toEqual({ ...work, recovering: true });
    work = { ...idle, importing: true };
    expect(startup.read()).toEqual({ ...work, recovering: true });
    startup.finish();
    expect(startup.read()).toEqual(work);
    work = idle;
    expect(startup.read()).toEqual(idle);
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
