import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { MockBackend } from './mocks/index.ts';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

describe('playback across tabs', () => {
  let backend: MockBackend;
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    backend = new MockBackend();
    render(
      <BackendProvider backend={backend}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </BackendProvider>,
    );
  });
  afterEach(() => {
    cleanup();
    backend.dispose();
    vi.unstubAllGlobals();
  });

  it('keeps playing while Settings or another tab is open, and shows it again on return', async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Recordings/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Vendor call/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    const call = vi.spyOn(backend, 'call');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    fireEvent.click(screen.getByRole('button', { name: /^Speakers/ }));
    await screen.findByRole('heading', { level: 1, name: 'Speakers' });
    expect(call).not.toHaveBeenCalledWith('pauseAudio', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: /^Recordings/ }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('shows a playing indicator in the sidebar and on the list row, and removes it on pause', async () => {
    const nav = () => within(screen.getByRole('navigation', { name: 'Main' }));
    fireEvent.click(screen.getByRole('button', { name: /^Recordings/ }));
    expect(nav().queryByRole('img', { name: 'Playing audio' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Vendor call/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(nav().getByRole('img', { name: 'Playing audio' })).toBeTruthy();

    // Still shown from another tab and from the list, on the playing meeting's row only.
    fireEvent.click(screen.getByRole('button', { name: /^Speakers/ }));
    expect(nav().getByRole('img', { name: 'Playing audio' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Recordings/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(nav().queryByRole('img', { name: 'Playing audio' })).toBeNull());
  });

  it('marks only the playing meeting in the list', async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Recordings/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Vendor call/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    const row = (await screen.findByRole('button', { name: /Vendor call/ })).closest('li');
    expect(within(row as HTMLElement).getByRole('img', { name: 'Playing audio' })).toBeTruthy();
    const others = screen
      .getAllByRole('listitem')
      .filter((item) => item !== row && item.className.includes('row'));
    for (const item of others)
      expect(within(item).queryByRole('img', { name: 'Playing audio' })).toBeNull();
  });

  it('keeps the bars still with reduced motion', () => {
    const css = readFileSync(join(__dirname, 'components', 'PlayingIndicator.module.css'), 'utf8');
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.bar \{\s*animation: none/);
  });

  it('pauses the first meeting when another is opened', async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Recordings/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Vendor call/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    const call = vi.spyOn(backend, 'call');
    fireEvent.click(await screen.findByRole('button', { name: /Weekly project sync/ }));
    await screen.findByRole('tab', { name: 'Transcript' });
    expect(call).toHaveBeenCalledWith('pauseAudio', expect.objectContaining({}));
    expect(await screen.findByRole('button', { name: 'Play' })).toBeTruthy();
  });
});
