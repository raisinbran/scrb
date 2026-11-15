import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('pauses the first meeting when another is opened', async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Recordings/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Vendor call/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    const call = vi.spyOn(backend, 'call');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Recordings' }));
    fireEvent.click(await screen.findByRole('button', { name: /Weekly project sync/ }));
    await screen.findByRole('tab', { name: 'Transcript' });
    expect(call).toHaveBeenCalledWith('pauseAudio', expect.objectContaining({}));
    expect(await screen.findByRole('button', { name: 'Play' })).toBeTruthy();
  });
});
