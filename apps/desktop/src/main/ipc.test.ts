import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers: Array<(event: unknown, ...args: unknown[]) => Promise<unknown>> = [];
vi.mock('electron', () => ({ ipcMain: { handle: (_c: string, fn: never) => handlers.push(fn) } }));

import { registerCallHandlers } from './ipc.ts';
import { isTrustedSenderEvent } from './app-trust.ts';

const trust = { appUrl: new URL('scribe://app/index.html'), owned: new Set([1]) };
const frame = { url: 'scribe://app/index.html' };

describe('registerCallHandlers with the real trust helper', () => {
  beforeEach(() => {
    handlers.length = 0;
    registerCallHandlers({} as never, (e) => isTrustedSenderEvent(e as never, trust));
  });

  it('refuses a subframe, an unowned window and a null-origin page, without dispatching', async () => {
    const bad = [
      { sender: { id: 1, mainFrame: {} }, senderFrame: frame },
      { sender: { id: 5, mainFrame: frame }, senderFrame: frame },
      { sender: { id: 1, mainFrame: { url: 'file:///a' } }, senderFrame: { url: 'file:///a' } },
    ];
    for (const event of bad) {
      expect(await handlers[0]!(event, 'listMeetings', {})).toEqual({
        ok: false,
        error: { code: 'invalidRequest', message: 'Request refused.' },
      });
    }
  });
});
