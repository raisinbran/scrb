import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { MockBackend } from './mocks/index.ts';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

const uiDir = __dirname;
let backend: MockBackend;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

const CONTROLS = 'button, input:not([type=hidden]), select, textarea, [role=button], [role=tab]';

/** A close-enough accessible name: aria-label, aria-labelledby, a label, own text, then title. */
function computeAccessibleName(el: HTMLElement): string {
  const label = el.getAttribute('aria-label');
  if (label) return label;
  const by = el.getAttribute('aria-labelledby');
  if (by)
    return by
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
  const labels = 'labels' in el ? [...((el as HTMLInputElement).labels ?? [])] : [];
  const text = labels.map((l) => l.textContent).join(' ') || el.textContent || '';
  return text.trim() || el.getAttribute('title') || '';
}

/** Describes every visible control that a screen reader would announce without a name. */
function unnamedControls(): string[] {
  return [...document.querySelectorAll<HTMLElement>(CONTROLS)]
    .filter((el) => !el.closest('[hidden], [aria-hidden=true], [inert]'))
    .filter((el) => computeAccessibleName(el).trim() === '')
    .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
}

async function startLive() {
  await goTo('Live');
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await advance(2000);
}

async function goTo(name: string) {
  const nav = screen.getByRole('navigation', { name: 'Main' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${name}`) }));
  await advance(0);
}

describe('accessibility', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    backend = new MockBackend();
    await backend.call('updateSettings', { location: { country: 'US', usState: null } });
    render(
      <BackendProvider backend={backend}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </BackendProvider>,
    );
    await advance(0);
  });

  afterEach(() => {
    cleanup();
    backend.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives every control an accessible name on every screen', async () => {
    const found: Record<string, string[]> = {};
    found['Live recording'] = (await startLive(), unnamedControls());
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await advance(0);
    for (const name of ['Live', 'Recordings', 'Speakers', 'Vocabulary', 'Help']) {
      await goTo(name);
      found[name] = unnamedControls();
    }
    await goTo('Recordings');
    fireEvent.click(screen.getByRole('button', { name: /Weekly project sync/ }));
    await advance(0);
    found['Meeting detail'] = unnamedControls();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await advance(0);
    found['Settings'] = unnamedControls();
    expect(found).toEqual({
      'Live recording': [],
      Live: [],
      Recordings: [],
      Speakers: [],
      Vocabulary: [],
      Help: [],
      'Meeting detail': [],
      Settings: [],
    });
  });

  it('names the Live transcript tool buttons, including the text-styles info tip', async () => {
    await startLive();
    const info = screen.getByRole('button', { name: 'Text styles' });
    fireEvent.focus(info);
    expect(info.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).not.toBe('');
  });

  it('shows the recording state as text, not only as a colored dot', async () => {
    await startLive();
    expect(screen.getAllByRole('status').some((el) => /Recording/.test(el.textContent ?? ''))).toBe(
      true,
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('img', { name: 'Recording in progress' })).toBeTruthy();
  });
});

describe('focus styles', () => {
  it('never remove the focus outline except for code-focused headings', () => {
    const files = readdirSync(uiDir, { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('.css'),
    );
    const offenders = files.filter((file) => {
      const css = readFileSync(join(uiDir, file), 'utf8');
      const removed = [...css.matchAll(/([^{}]+)\{[^{}]*outline:\s*(none|0)\b[^{}]*\}/g)];
      return removed.some((m) => !/h1\[tabindex='-1'\]:focus-visible/.test(m[1] as string));
    });
    expect(offenders).toEqual([]);
  });
});
