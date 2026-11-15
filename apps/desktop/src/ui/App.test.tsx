import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it.each(['Live', 'Recordings', 'Speakers', 'Vocabulary', 'Help'])(
    'opens %s from the sidebar',
    async (label) => {
      renderApp();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(await screen.findByRole('heading', { level: 1, name: label })).toBeTruthy();
    },
  );

  it('has no inspector panel or toggle, and ignores old saved inspector state', async () => {
    window.localStorage.setItem('scrb.inspector.open', 'true');
    window.localStorage.setItem('scrb.inspector.width', '300');
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Live' })).toBeTruthy();
    expect(screen.queryByLabelText(/inspector/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /inspector/i })).toBeNull();
    expect(screen.getByRole('main')).toBeTruthy();
  });

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

  it('opens Settings over the app and closes it with Escape, leaving the screen as it was', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Live' })).toBeTruthy();
    screen.getByRole('button', { name: 'Settings' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    expect(dialog).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Live' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }));
  });

  it('keeps recording while Settings is open', async () => {
    const backend = renderApp();
    await backend.call('startRecording', {});
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('dialog', { name: 'Settings' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await backend.call('getRecordingSnapshot')).state.status).toBe('recording');
  });

  it('closes Settings when the dark area outside it is clicked', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('applies a theme chosen in Settings', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
