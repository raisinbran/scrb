import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { MockBackend } from './mocks/index.ts';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

function renderApp(backend = new MockBackend()) {
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

  it('opens Settings as an ordinary tab, with no dialog and no overlay', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Live' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Live' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('keeps recording while Settings is open', async () => {
    const backend = renderApp();
    await backend.call('startRecording', {});
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect((await backend.call('getRecordingSnapshot')).state.status).toBe('recording');
    fireEvent.click(screen.getByRole('button', { name: /^Live/ }));
    expect((await backend.call('getRecordingSnapshot')).state.status).toBe('recording');
  });

  it('applies onboarding and Settings locations to each new recording and dismisses only that session', async () => {
    const backend = new MockBackend();
    await backend.call('updateSettings', { location: { country: null, usState: null } });
    backend.setLibrary([]);
    renderApp(backend);

    const dialog = await screen.findByRole('dialog', { name: 'Where are you based?' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Where are you based?' })).toBe(dialog);
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'IL' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () =>
      expect((await backend.call('getSettings')).location).toEqual({
        country: 'US',
        usState: 'IL',
      }),
    );

    const start = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
      await screen.findByRole('button', { name: 'Stop' });
    };
    const stop = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
      await screen.findByRole('button', { name: 'Start' });
    };
    const dismiss = /Dismiss voice-profile privacy reminder for this recording/;
    const changeState = async (usState: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.change(await screen.findByRole('combobox', { name: /State where you live/ }), {
        target: { value: usState },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(async () =>
        expect((await backend.call('getSettings')).location).toEqual({ country: 'US', usState }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    };

    try {
      await start();
      fireEvent.click(await screen.findByRole('button', { name: dismiss }));
      expect(screen.queryByRole('button', { name: dismiss })).toBeNull();
      await stop();

      await start();
      expect(await screen.findByRole('button', { name: dismiss })).toBeTruthy();
      await stop();

      await changeState('NY');
      await start();
      await screen.findByRole('button', { name: 'Stop' });
      expect(screen.queryByRole('button', { name: dismiss })).toBeNull();
      await stop();

      await changeState('TX');
      await start();
      expect(await screen.findByRole('button', { name: dismiss })).toBeTruthy();
      await stop();
    } finally {
      if ((await backend.call('getRecordingSnapshot')).state.status !== 'idle') {
        await backend.call('stopRecording');
      }
    }
  });

  it('applies a theme chosen in Settings', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
