import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ModelsNotice } from '../components/ModelsNotice.tsx';
import { BackendProvider } from '../lib/backend-context.tsx';
import { OpenModelsProvider } from '../lib/models-missing.tsx';
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
      await screen.findByRole('button', { name: 'Check for model updates' });
      expect(screen.queryByRole('button', { name: /^Download models/ })).toBeNull();
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

    it('does not treat a model update as the first download', async () => {
      backend = new MockBackend();
      renderWith(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Check for model updates' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Install update for Final speech' }),
      );
      expect(await screen.findByText(/Downloading .*30%/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
      expect(screen.queryByRole('progressbar', { name: 'Overall model download' })).toBeNull();
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

    it('enables Start again after the download finishes', async () => {
      renderWith(
        backend,
        <>
          <LiveScreen />
          <SettingsScreen />
        </>,
      );
      expect(
        ((await screen.findByRole('button', { name: 'Start' })) as HTMLButtonElement).disabled,
      ).toBe(true);
      fireEvent.click(await screen.findByRole('button', { name: /^Download models \(/ }));
      await waitFor(
        () =>
          expect(
            (screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled,
          ).toBe(false),
        FAST,
      );
    });
  });
});
