import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { App } from '../App.tsx';
import { ModelsNotice } from '../components/ModelsNotice.tsx';
import { BackendProvider } from '../lib/backend-context.tsx';
import { OpenModelsProvider, resetModelsRestartState } from '../lib/models-missing.tsx';
import { MockBackend } from '../mocks/index.ts';
import { ThemeProvider } from '../theme/ThemeProvider.tsx';
import { LiveScreen } from './LiveScreen.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { failureText } from './settings/ModelsSection.tsx';

function renderWith(backend: MockBackend, node: ReactNode, openModels = () => undefined) {
  return render(
    <BackendProvider backend={backend}>
      <ThemeProvider>
        <OpenModelsProvider value={openModels}>{node}</OpenModelsProvider>
      </ThemeProvider>
    </BackendProvider>,
  );
}

const download = () => screen.findByRole('button', { name: /^Download models/ });
const FAST = { timeout: 4000 };

describe('model download (Settings > Models, first-run notice, Record)', () => {
  let backend: MockBackend;

  beforeEach(() => {
    window.localStorage.clear();
    resetModelsRestartState();
    backend = new MockBackend();
    backend.setDownloadStepMs(5);
    backend.arm('modelsMissing');
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  afterEach(() => {
    cleanup();
    backend.dispose();
    vi.unstubAllGlobals();
  });

  describe('Settings > Models', () => {
    it('lists the five files as not downloaded and puts the total size on the button', async () => {
      renderWith(backend, <SettingsScreen />);
      const button = await download();
      expect(button.textContent).toBe('Download models (806 MB)');
      expect(screen.getAllByText(/not downloaded yet/)).toHaveLength(5);
      expect(screen.getByText(/needs 5 more speech files \(806 MB\)/)).toBeTruthy();
    });

    it('shows nothing to download when the models are installed', async () => {
      backend = new MockBackend();
      renderWith(backend, <SettingsScreen />);
      await screen.findByText('Models');
      expect(await screen.findByText(/Model updates and rollback are not available yet/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Download models/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Check for model updates' })).toBeNull();
    });

    it('starts, shows per-file and overall progress, then says the models are ready', async () => {
      backend.setDownloadStepMs(40);
      renderWith(backend, <SettingsScreen />);
      fireEvent.click(await download());
      expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();
      expect(await screen.findByText(/Downloading Live speech model: 30% of 190 MB/)).toBeTruthy();
      expect(screen.getByRole('progressbar', { name: 'Overall model download' })).toBeTruthy();
      expect(screen.getByRole('progressbar', { name: 'Live speech model download' })).toBeTruthy();
      expect(await screen.findByText(/Downloading models: .* of 806 MB/)).toBeTruthy();
      expect(
        await screen.findByText('Models ready. Reopen Scribe to finish.', {}, FAST),
      ).toBeTruthy();
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /^Download models/ })).toBeNull(),
      );
      expect(screen.queryAllByText(/not downloaded yet/)).toHaveLength(0);
    });

    it('cancels, keeps the finished files, and continues from the button', async () => {
      backend.setDownloadStepMs(20);
      renderWith(backend, <SettingsScreen />);
      fireEvent.click(await download());
      // The first file is done once its row stops being "not downloaded yet".
      await waitFor(
        () => expect(screen.queryAllByText(/not downloaded yet/).length).toBeLessThan(5),
        FAST,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
      expect(await screen.findByText(/Download cancelled/)).toBeTruthy();
      expect(screen.queryByRole('progressbar', { name: 'Overall model download' })).toBeNull();
      const left = screen.getAllByText(/not downloaded yet/).length;
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(5);
      fireEvent.click(await download());
      expect(
        await screen.findByText('Models ready. Reopen Scribe to finish.', {}, FAST),
      ).toBeTruthy();
    });

    it.each([
      [
        'downloadOffline',
        /Could not reach the download server\. Check your internet connection, then press Retry/,
      ],
      [
        'downloadDiskSpace',
        /not enough free disk space\. Free up about 1\.1 GB .* then press Retry/,
      ],
      ['downloadChecksum', /did not match its expected checksum.*Press Retry to download it again/],
    ] as const)(
      'shows the %s failure with its next step, and Retry finishes the download',
      async (fault, text) => {
        backend.arm(fault);
        renderWith(backend, <SettingsScreen />);
        fireEvent.click(await download());
        const alert = await screen.findByRole('alert', {}, FAST);
        expect(alert.textContent).toMatch(text);
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
          await screen.findByText('Models ready. Reopen Scribe to finish.', {}, FAST),
        ).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
      },
    );

    it('gives a next step for a failure with no known reason', () => {
      expect(failureText(undefined, 0, 'The server said no.')).toBe(
        'The server said no. Press Retry. If it keeps failing, try again later.',
      );
      expect(failureText('http', 0, undefined)).toContain('Press Retry');
    });

    it('never presents mock-only updates or rollback as download actions', async () => {
      backend = new MockBackend();
      expect((await backend.call('checkModelUpdates')).length).toBeGreaterThan(0);
      renderWith(backend, <SettingsScreen />);
      expect(await screen.findByText(/Model updates and rollback are not available yet/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Check for model updates' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Install update/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Revert .* previous model/ })).toBeNull();
      expect(screen.queryByText(/Version mock-2 is available/)).toBeNull();
    });

    it('downloads the optional summary model with separate progress and an installed state', async () => {
      backend = new MockBackend();
      backend.setSummaryModelInstalled(false);
      backend.arm('modelsMissing');
      renderWith(backend, <SettingsScreen />);
      const downloadSummary = await screen.findByRole('button', {
        name: 'Download summary model',
      });
      expect(screen.getByText('Summaries (5.7 GB, optional)')).toBeTruthy();
      fireEvent.click(downloadSummary);

      expect(
        await screen.findByRole('progressbar', { name: 'Summary model download' }),
      ).toBeTruthy();
      expect(screen.queryByRole('progressbar', { name: 'Overall model download' })).toBeNull();
      expect(
        await screen.findByRole('button', { name: 'Cancel summary model download' }),
      ).toBeTruthy();
      expect(await screen.findByText('Installed', {}, FAST)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Download summary model' })).toBeNull();
      expect(screen.getByRole('button', { name: /^Download models/ })).toBeTruthy();
    });

    it('cancels the summary transfer and keeps retry available', async () => {
      backend = new MockBackend();
      backend.setSummaryModelInstalled(false);
      backend.arm('modelsMissing');
      backend.setDownloadStepMs(500);
      renderWith(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Download summary model' }));
      expect(
        await screen.findByRole('button', { name: 'Cancel summary model download' }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel summary model download' }));
      expect(await screen.findByText(/Download cancelled/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Download summary model' })).toBeTruthy();
      expect(screen.queryByRole('progressbar', { name: 'Summary model download' })).toBeNull();
    });

    it.each([
      [
        'downloadOffline',
        /Could not reach the download server\. Check your internet connection, then press Retry/,
      ],
      [
        'downloadDiskSpace',
        /not enough free disk space\. Free up about 5\.9 GB .* then press Retry/,
      ],
      ['downloadChecksum', /did not match its expected checksum.*Press Retry to download it again/],
    ] as const)(
      'shows the optional summary %s failure and retries successfully',
      async (fault, text) => {
        backend = new MockBackend();
        backend.setSummaryModelInstalled(false);
        backend.setDownloadStepMs(5);
        backend.arm(fault);
        renderWith(backend, <SettingsScreen />);
        fireEvent.click(await screen.findByRole('button', { name: 'Download summary model' }));
        expect((await screen.findByRole('alert', {}, FAST)).textContent).toMatch(text);
        fireEvent.click(screen.getByRole('button', { name: 'Retry summary model download' }));
        expect(await screen.findByText('Installed', {}, FAST)).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
      },
    );

    it('does not let summary cancellation interrupt an active speech-model download', async () => {
      backend.setSummaryModelInstalled(false);
      backend.setDownloadStepMs(500);
      renderWith(backend, <SettingsScreen />);
      fireEvent.click(await download());
      const summaryDownload = await screen.findByRole('button', {
        name: 'Download summary model',
      });
      expect((summaryDownload as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });
  });

  describe('first-run notice', () => {
    it('shows a notice, not a blocking dialog, with a link to the download', async () => {
      const open = vi.fn();
      renderWith(backend, <ModelsNotice />, open);
      const notice = await screen.findByRole('status', { name: 'Models needed' });
      expect(notice.textContent).toContain('speech models (806 MB)');
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(within(notice).getByRole('button', { name: 'Download models' }));
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('is absent when the models are installed', async () => {
      backend = new MockBackend();
      renderWith(backend, <ModelsNotice />);
      await waitFor(() => expect(backend.isArmed('modelsMissing')).toBe(false));
      expect(screen.queryByRole('status', { name: 'Models needed' })).toBeNull();
    });
  });

  describe('Record while models are missing', () => {
    it('disables Start and offers the download instead of a terminal command', async () => {
      const open = vi.fn();
      renderWith(backend, <LiveScreen />, open);
      expect(await screen.findByText('Models needed')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(document.body.textContent).not.toMatch(/terminal|package-mac|scripts\//i);
      fireEvent.click(screen.getByRole('button', { name: 'Download models' }));
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('enables Start when the models are installed', async () => {
      backend = new MockBackend();
      renderWith(backend, <LiveScreen />);
      expect(await screen.findByText('Ready to record')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(
        false,
      );
      expect(screen.queryByRole('button', { name: 'Download models' })).toBeNull();
    });

    it('keeps recording available when only the optional summary model is missing', async () => {
      backend = new MockBackend();
      backend.setSummaryModelInstalled(false);
      renderWith(backend, <LiveScreen />);
      expect(await screen.findByText('Ready to record')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(
        false,
      );
      const setup = await backend.call('getSetupStatus');
      expect(setup.complete).toBe(true);
      expect(setup.models.find((model) => model.role === 'summary')?.installed).toBe(false);
    });

    it('keeps Start disabled after the download until the restart, saying why', async () => {
      renderWith(
        backend,
        <>
          <LiveScreen />
          <SettingsScreen />
        </>,
      );
      const start = (await screen.findByRole('button', { name: 'Start' })) as HTMLButtonElement;
      expect(start.disabled).toBe(true);
      fireEvent.click(await screen.findByRole('button', { name: /^Download models \(/ }));
      await waitFor(
        () => expect(screen.getByText('Restarting to finish setup.')).toBeTruthy(),
        FAST,
      );
      expect(start.disabled).toBe(true);
      expect(start.getAttribute('aria-describedby')).toBe('start-blocked-reason');
      expect(document.getElementById('start-blocked-reason')?.textContent).toBe(
        'Restarting to finish setup',
      );
      const called = vi.spyOn(backend, 'call');
      fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
      expect(called).not.toHaveBeenCalledWith('startRecording', expect.anything());
    });

    it('keeps Start disabled while the setup status is still loading', async () => {
      backend = new MockBackend();
      const never = new Promise<never>(() => undefined);
      const real = backend.call.bind(backend);
      vi.spyOn(backend, 'call').mockImplementation(((name: string, ...rest: never[]) =>
        name === 'getSetupStatus'
          ? never
          : (real as never as (...a: unknown[]) => unknown)(name, ...rest)) as never);
      renderWith(backend, <LiveScreen />);
      const start = (await screen.findByRole('button', { name: 'Start' })) as HTMLButtonElement;
      expect(start.disabled).toBe(true);
      expect(document.getElementById('start-blocked-reason')?.textContent).toMatch(/Checking/);
    });

    it('keeps Start disabled when the setup status cannot be read', async () => {
      backend = new MockBackend();
      const real = backend.call.bind(backend);
      vi.spyOn(backend, 'call').mockImplementation(((name: string, ...rest: never[]) =>
        name === 'getSetupStatus'
          ? Promise.reject(new Error('no answer'))
          : (real as never as (...a: unknown[]) => unknown)(name, ...rest)) as never);
      renderWith(backend, <LiveScreen />);
      await waitFor(() =>
        expect(document.getElementById('start-blocked-reason')?.textContent).toMatch(
          /could not check/,
        ),
      );
      expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
  });

  describe('the notice link while Settings is already open', () => {
    it('scrolls to and focuses the Models section', async () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      render(
        <BackendProvider backend={backend}>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </BackendProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      await screen.findByRole('heading', { name: 'Models' });
      scroll.mockClear();
      const notice = await screen.findByRole('status', { name: 'Models needed' });
      fireEvent.click(within(notice).getByRole('button', { name: 'Download models' }));
      await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
      expect(document.activeElement?.id).toBe('settings-models');
    });
  });
});
