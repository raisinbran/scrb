import { describe, expect, it } from 'vitest';
import { MINIMIZE_SETTLE_MS, createMinimizeGuard } from './mini-minimize-guard.ts';

describe('createMinimizeGuard', () => {
  it('does nothing until the mini window minimizes', () => {
    const guard = createMinimizeGuard(() => 1000);
    expect(guard.shouldBlurMain()).toBe(false);
    expect(guard.shouldIgnoreActivate()).toBe(false);
  });

  it('sends a main window back and ignores activate only while the minimize settles', () => {
    let clock = 5000;
    const guard = createMinimizeGuard(() => clock);
    guard.minimized();
    clock += MINIMIZE_SETTLE_MS - 1;
    expect(guard.shouldBlurMain()).toBe(true);
    expect(guard.shouldIgnoreActivate()).toBe(true);
    clock += 1;
    expect(guard.shouldBlurMain()).toBe(false);
    expect(guard.shouldIgnoreActivate()).toBe(false);
  });
});
