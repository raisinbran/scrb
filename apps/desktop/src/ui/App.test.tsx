import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { MockBackend } from './mocks/index.ts';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

function renderApp() {
  const backend = new MockBackend();
  render(
    <BackendProvider backend={backend}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BackendProvider>,
  );
  return backend;
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(['Live', 'Recordings', 'Speakers', 'Vocabulary', 'Settings', 'Help'])(
    'opens %s from the sidebar',
    async (label) => {
      renderApp();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(await screen.findByRole('heading', { level: 1, name: label })).toBeTruthy();
    },
  );

  it('opens Help with F1', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'F1' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Help' })).toBeTruthy();
  });

  it('shows the empty library state', async () => {
    const backend = renderApp();
    backend.setLibrary([]);
    fireEvent.click(screen.getByRole('button', { name: 'Recordings' }));
    expect(await screen.findByText('No recordings yet')).toBeTruthy();
  });

  it('applies a theme chosen in Settings', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
