import { describe, expect, it, vi } from 'vitest';
import { createMiniController, shouldShowMini, withoutMini } from './mini-window.ts';

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
  const controller = createMiniController((onClosedByUser) => {
    const close = vi.fn();
    closes.push(close);
    userCloses.push(onClosedByUser);
    return { close };
  });
  return { controller, closes, userCloses };
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

describe('withoutMini', () => {
  it('leaves no main window when only the mini one is open, so the dock can recreate it', () => {
    const mini = { id: 'mini' };
    expect(withoutMini([mini], mini)).toEqual([]);
    const main = { id: 'main' };
    expect(withoutMini([mini, main], mini)).toEqual([main]);
    expect(withoutMini([main], null)).toEqual([main]);
  });
});
