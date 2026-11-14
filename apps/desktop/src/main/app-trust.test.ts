import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isAppUrl, isTrustedSenderEvent } from './app-trust.ts';
import { lockDownContents } from './security.ts';

const packaged = new URL('scribe://app/index.html');
const dev = new URL('http://localhost:5183');

describe('isAppUrl', () => {
  it('accepts the real app addresses', () => {
    for (const url of [
      'scribe://app/index.html',
      'scribe://app/index.html#mini',
      'scribe://app/',
    ]) {
      expect(isAppUrl(url, packaged)).toBe(true);
    }
    for (const url of ['http://localhost:5183/', 'http://localhost:5183/#mini']) {
      expect(isAppUrl(url, dev)).toBe(true);
    }
  });

  it('rejects look-alikes and opaque origins', () => {
    for (const url of [
      'scribe://evil/x',
      'scribe://app:80/',
      'scribe://user@app/',
      'scribe://APP/',
      'file:///tmp/a.html',
      'data:text/html,x',
      'about:blank',
      'about:srcdoc',
      'blob:null/1',
      'javascript:1',
      'http://localhost:5184/',
      'https://example.com/',
      '',
      'not a url',
    ]) {
      expect(isAppUrl(url, packaged), url).toBe(false);
    }
    expect(isAppUrl(undefined, packaged)).toBe(false);
    expect(isAppUrl('scribe://app/', dev)).toBe(false);
  });
});

function event(url: string | undefined, opts: { id?: number; sub?: boolean } = {}) {
  const mainFrame = { url: 'main' };
  const frame = url === undefined ? undefined : opts.sub ? { url } : { ...mainFrame, url };
  return {
    sender: { id: opts.id ?? 1, mainFrame: opts.sub || !frame ? mainFrame : frame },
    senderFrame: frame,
  };
}
const trust = { appUrl: packaged, owned: new Set([1, 2]) };

describe('isTrustedSenderEvent', () => {
  it('accepts the top frame of an owned window on the app address', () => {
    expect(isTrustedSenderEvent(event('scribe://app/index.html'), trust)).toBe(true);
    expect(isTrustedSenderEvent(event('scribe://app/index.html#mini', { id: 2 }), trust)).toBe(
      true,
    );
  });

  it('refuses subframes, unowned windows, hostile URLs and a missing frame', () => {
    expect(isTrustedSenderEvent(event('scribe://app/index.html', { sub: true }), trust)).toBe(
      false,
    );
    expect(isTrustedSenderEvent(event('scribe://app/index.html', { id: 9 }), trust)).toBe(false);
    for (const url of [
      'scribe://evil/x',
      'file:///tmp/a.html',
      'data:text/html,x',
      'about:blank',
      'bad',
    ]) {
      expect(isTrustedSenderEvent(event(url), trust), url).toBe(false);
    }
    expect(isTrustedSenderEvent(event(undefined), trust)).toBe(false);
  });

  it('refuses instead of throwing on a malformed event', () => {
    expect(isTrustedSenderEvent({} as never, trust)).toBe(false);
  });
});

describe('lockDownContents', () => {
  function fake() {
    const listeners = new Map<
      string,
      (details: { url: string; preventDefault: () => void }) => void
    >();
    const contents = {
      on: (name: string, fn: never) => listeners.set(name, fn),
      setWindowOpenHandler: () => undefined,
    };
    lockDownContents(contents as never, 'scribe://app/index.html');
    return listeners;
  }

  it('stops navigation, redirects and frame loads away from the app', () => {
    const listeners = fake();
    for (const name of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
      const handler = listeners.get(name)!;
      for (const url of [
        'file:///etc/hosts',
        'scribe://evil/',
        'https://example.com/',
        'data:text/html,x',
      ]) {
        const preventDefault = vi.fn();
        handler({ preventDefault, url });
        expect(preventDefault, `${name} ${url}`).toHaveBeenCalledOnce();
      }
      const preventDefault = vi.fn();
      handler({ preventDefault, url: 'scribe://app/index.html#x' });
      expect(preventDefault).not.toHaveBeenCalled();
    }
  });
});

describe('production wiring', () => {
  it('main.ts and security.ts never compare origins themselves', () => {
    for (const file of ['main.ts', 'security.ts']) {
      const source = readFileSync(path.join(__dirname, file), 'utf8');
      expect(source, file).not.toMatch(/\.origin\b/);
    }
    expect(readFileSync(path.join(__dirname, 'main.ts'), 'utf8')).toContain(
      'isTrustedSenderEvent(',
    );
  });
});
