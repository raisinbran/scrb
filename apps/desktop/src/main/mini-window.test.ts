import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import {
  COMPACT_URL,
  EXPAND_URL,
  SHOW_MAIN_URL,
  MINI_WINDOW_OPTIONS,
  createCloseGate,
  createMiniController,
  miniWindowOpenHandler,
  HIDE_URL,
  restoreMain,
  shouldShowMini,
  withoutMini,
} from './mini-window.ts';
import { lockDownContents } from './security.ts';

describe('shouldShowMini', () => {
  it.each([
    ['recording', false, false, true],
    ['paused', false, false, true],
    ['recording', true, false, false],
    ['recording', false, true, false],
    ['idle', false, false, false],
    ['stopping', false, false, false],
  ])('%s, main in front %s, dismissed %s -> %s', (status, mainInFront, dismissed, expected) => {
    expect(shouldShowMini({ status, mainInFront, dismissed })).toBe(expected);
  });
});

function setup() {
  const closes: ReturnType<typeof vi.fn>[] = [];
  const userCloses: (() => void)[] = [];
  const hiddenEvents: boolean[] = [];
  const controller = createMiniController(
    (onClosedByUser) => {
      const close = vi.fn();
      closes.push(close);
      userCloses.push(onClosedByUser);
      return { close };
    },
    (hidden) => hiddenEvents.push(hidden),
  );
  return { controller, closes, userCloses, hiddenEvents };
}

describe('createMiniController', () => {
  it('opens once when the main window leaves the front during a recording, and closes when it returns', () => {
    const { controller, closes } = setup();
    controller.setStatus('recording');
    expect(closes).toHaveLength(0);
    controller.setMainInFront(false);
    controller.setMainInFront(false);
    expect(closes).toHaveLength(1);
    controller.setMainInFront(true);
    expect(closes[0]).toHaveBeenCalledTimes(1);
  });

  it('hide closes the window and keeps it away, and tells the main window', () => {
    const { controller, closes, hiddenEvents } = setup();
    controller.setStatus('recording');
    controller.setMainInFront(false);
    controller.hide();
    expect(closes[0]).toHaveBeenCalledTimes(1);
    controller.setMainInFront(true);
    controller.setMainInFront(false);
    expect(closes).toHaveLength(1);
    expect(hiddenEvents).toEqual([true]);
  });

  it('show brings it back even with the main window in front, until the user returns to it', () => {
    const { controller, closes, hiddenEvents } = setup();
    controller.setStatus('recording');
    controller.setMainInFront(false);
    controller.hide();
    controller.setMainInFront(true);
    controller.show();
    expect(closes).toHaveLength(2);
    expect(hiddenEvents).toEqual([true, false]);
    controller.setMainInFront(true);
    expect(closes[1]).not.toHaveBeenCalled();
    controller.setMainInFront(false);
    controller.setMainInFront(true);
    expect(closes[1]).toHaveBeenCalledTimes(1);
  });

  it('forgets a hide when the recording stops, and when no main window is left', () => {
    const { controller, closes, hiddenEvents } = setup();
    controller.setStatus('recording');
    controller.setMainInFront(false);
    controller.hide();
    controller.setStatus('idle');
    expect(hiddenEvents).toEqual([true, false]);
    controller.setStatus('recording');
    expect(closes).toHaveLength(2);
    controller.hide();
    controller.mainGone();
    expect(hiddenEvents).toEqual([true, false, true, false]);
    expect(closes).toHaveLength(3);
  });

  it('closes when the recording stops', () => {
    const { controller, closes } = setup();
    controller.setMainInFront(false);
    controller.setStatus('paused');
    expect(closes).toHaveLength(1);
    controller.setStatus('idle');
    expect(closes[0]).toHaveBeenCalledTimes(1);
  });

  it('stays closed for the recording once the user closes it, and returns for the next one', () => {
    const { controller, closes, userCloses } = setup();
    controller.setMainInFront(false);
    controller.setStatus('recording');
    userCloses[0]!();
    controller.setStatus('paused');
    controller.setMainInFront(true);
    controller.setMainInFront(false);
    expect(closes).toHaveLength(1);
    controller.setStatus('idle');
    controller.setStatus('recording');
    expect(closes).toHaveLength(2);
  });

  it('does not count its own close as the user closing it', () => {
    const { controller, closes, userCloses } = setup();
    controller.setMainInFront(false);
    controller.setStatus('recording');
    controller.setMainInFront(true);
    userCloses[0]!();
    controller.setMainInFront(false);
    expect(closes).toHaveLength(2);
  });

  it('never reopens after dispose', () => {
    const { controller, closes } = setup();
    controller.setMainInFront(false);
    controller.setStatus('recording');
    controller.dispose();
    expect(closes[0]).toHaveBeenCalledTimes(1);
    controller.setStatus('paused');
    expect(closes).toHaveLength(1);
  });
});

describe('rapid focus changes', () => {
  it('shows the window still fading out again instead of opening a second one', () => {
    const reopen = vi.fn(() => true);
    const close = vi.fn();
    const open = vi.fn(() => ({ close, reopen }));
    const controller = createMiniController(open);
    controller.setStatus('recording');
    controller.setMainInFront(false);
    controller.setMainInFront(true);
    controller.setMainInFront(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);
    controller.setMainInFront(true);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('opens a new window when the fading one is already gone', () => {
    const open = vi.fn(() => ({ close: vi.fn(), reopen: () => false }));
    const controller = createMiniController(open);
    controller.setStatus('recording');
    controller.setMainInFront(false);
    controller.setMainInFront(true);
    controller.setMainInFront(false);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('a user close of the reused window still keeps it closed', () => {
    const userCloses: (() => void)[] = [];
    const open = vi.fn((onClosed: () => void) => {
      userCloses.push(onClosed);
      return { close: vi.fn(), reopen: () => true };
    });
    const controller = createMiniController(open);
    controller.setStatus('recording');
    controller.setMainInFront(false);
    controller.setMainInFront(true);
    controller.setMainInFront(false);
    userCloses[0]!();
    controller.setMainInFront(true);
    controller.setMainInFront(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('withoutMini', () => {
  it('leaves no main window when only the mini one is open, so the dock can recreate it', () => {
    const mini = { id: 'mini' };
    expect(withoutMini([mini], new Set([mini]))).toEqual([]);
    const main = { id: 'main' };
    expect(withoutMini([mini, main], new Set([mini]))).toEqual([main]);
    expect(withoutMini([main], new Set())).toEqual([main]);
  });
});

describe('restoreMain', () => {
  it('creates the main window when only the mini one is left (second launch or dock)', () => {
    const mini = { id: 'mini' };
    const focus = vi.fn();
    const create = vi.fn();
    restoreMain(withoutMini([mini], new Set([mini])), focus, create);
    expect(create).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the existing main window instead of making a second one', () => {
    const main = { id: 'main' };
    const mini = { id: 'mini' };
    const focus = vi.fn();
    const create = vi.fn();
    restoreMain(withoutMini([mini, main], new Set([mini])), focus, create);
    expect(focus).toHaveBeenCalledWith(main);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('miniWindowOpenHandler', () => {
  it('maps each exact address to its action and denies every open', () => {
    const showMain = vi.fn();
    const setCompact = vi.fn();
    const hide = vi.fn();
    const handler = miniWindowOpenHandler(showMain, setCompact, hide);
    expect(handler({ url: SHOW_MAIN_URL })).toEqual({ action: 'deny' });
    expect(handler({ url: COMPACT_URL })).toEqual({ action: 'deny' });
    expect(handler({ url: EXPAND_URL })).toEqual({ action: 'deny' });
    expect(handler({ url: HIDE_URL })).toEqual({ action: 'deny' });
    expect(hide).toHaveBeenCalledTimes(1);
    expect(showMain).toHaveBeenCalledTimes(1);
    expect(setCompact.mock.calls).toEqual([[true], [false]]);
  });

  it('does nothing for any other address, and still denies', () => {
    const showMain = vi.fn();
    const setCompact = vi.fn();
    const hide = vi.fn();
    const handler = miniWindowOpenHandler(showMain, setCompact, hide);
    for (const url of [
      'https://example.com/',
      `${SHOW_MAIN_URL}/extra`,
      `${COMPACT_URL}?x=1`,
      `${HIDE_URL}/extra`,
      'scrb-app://other',
      'scrb://app/index.html',
    ]) {
      expect(handler({ url })).toEqual({ action: 'deny' });
    }
    expect(showMain).not.toHaveBeenCalled();
    expect(setCompact).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });
});

describe('the main window keeps denying every open', () => {
  it('lockDownContents alone never acts on the show-main address', () => {
    let handler: (details: { url: string }) => { action: string } = () => ({ action: 'allow' });
    const contents = {
      on: () => undefined,
      setWindowOpenHandler: (next: typeof handler) => (handler = next),
    } as unknown as WebContents;
    lockDownContents(contents, 'scribe://app/index.html');
    expect(handler({ url: SHOW_MAIN_URL })).toEqual({ action: 'deny' });
  });
});

describe('MINI_WINDOW_OPTIONS', () => {
  it('has no OS minimize, which can raise the main window; the compact button replaces it', () => {
    expect(MINI_WINDOW_OPTIONS.minimizable).toBe(false);
  });

  it('keeps the content-size, always-on-top and hidden-until-ready settings', () => {
    expect(MINI_WINDOW_OPTIONS).toMatchObject({
      frame: false,
      useContentSize: true,
      alwaysOnTop: true,
      show: false,
    });
  });
});

describe('the mini window cannot be closed by the user', () => {
  it('has the OS close control off', () => {
    expect(MINI_WINDOW_OPTIONS.closable).toBe(false);
  });

  it('cancels a close until the app opens the gate', () => {
    const gate = createCloseGate();
    expect(gate.blocks()).toBe(true);
    gate.allow();
    expect(gate.blocks()).toBe(false);
  });
});
