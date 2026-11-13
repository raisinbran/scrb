import { describe, expect, it } from 'vitest';
import { secureWebPreferences } from './web-preferences.ts';

describe('secureWebPreferences', () => {
  it('keeps the locked-down settings for every window', () => {
    expect(secureWebPreferences('/app')).toEqual({
      preload: expect.stringMatching(/preload\.cjs$/),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    });
  });
});
