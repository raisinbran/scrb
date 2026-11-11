import { app, BrowserWindow, dialog, shell, type IpcMainInvokeEvent } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { IPC_EVENT_CHANNEL, PROTOCOL_VERSION, type EventName } from '@scrb/contracts';
import { openBackend } from './backend.ts';
import { startCore } from './core-relay.ts';
import { registerCallHandlers } from './ipc.ts';
import { closeBeforeQuit } from './quit.ts';
import {
  APP_ORIGIN,
  denyAllPermissions,
  lockDownContents,
  registerAppScheme,
  serveMedia,
  serveRenderer,
} from './security.ts';

// Ignored in packaged builds, so the environment can never point the app at another page.
const devServerUrl = app.isPackaged ? undefined : process.env['SCRB_DEV_SERVER_URL'];
const appUrl = devServerUrl ?? `${APP_ORIGIN}/index.html`;
const appOrigin = new URL(appUrl).origin;

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  return url !== undefined && new URL(url).origin === appOrigin;
}

function sendToWindows(name: EventName, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_EVENT_CHANNEL, name, payload);
  }
}

function coreBinaryPath(): string {
  const file = process.platform === 'win32' ? 'scrb-core.exe' : 'scrb-core';
  if (app.isPackaged) return path.join(process.resourcesPath, 'bin', file);
  // Like SCRB_DEV_SERVER_URL, ignored in packaged builds. Main runs from apps/desktop/dist-electron.
  return process.env['SCRB_CORE_PATH'] || path.resolve(__dirname, '../../../target/debug', file);
}

function createMainWindow(
  warning: string | null = null,
  recovery: { kind: 'blocked' | 'retainedCopy'; folder: string } | null = null,
  stopPlayback: () => void = () => undefined,
): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 12, y: 12 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#808080', height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  lockDownContents(window.webContents, appOrigin);
  // A reloaded or lost page cannot release what it was granted, so grants end here.
  window.webContents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) stopPlayback();
  });
  window.webContents.on('render-process-gone', stopPlayback);
  window.on('closed', stopPlayback);
  window.once('ready-to-show', () => {
    window.show();
    if (recovery) {
      const available = recovery.kind === 'retainedCopy';
      const buttons = available
        ? ['Continue', 'Retry cleanup', 'Open library folder', 'Keep copies and close']
        : ['Retry verification', 'Open library folder', 'Keep copies and close'];
      void dialog
        .showMessageBox(window, {
          type: 'warning',
          title: 'Index recovery',
          message: warning ?? 'The library index needs review.',
          detail: available
            ? 'The verified live library remains available; an older index copy may still contain data.'
            : 'The library is unavailable until the index is verified. No file was restored or discarded.',
          buttons,
          cancelId: buttons.length - 1,
          noLink: true,
        })
        .then(async ({ response }) => {
          if (available && response === 0) return;
          if (response === (available ? 1 : 0)) {
            app.relaunch();
            app.exit(0);
            return;
          }
          if (response === (available ? 2 : 1)) {
            await shell.openPath(recovery.folder);
            if (!available) app.quit();
            return;
          }
          app.quit();
        });
    } else if (warning) {
      void dialog.showMessageBox(window, { type: 'warning', message: warning });
    }
  });
  void window.loadURL(appUrl);
}

registerAppScheme();

// A second copy would write to the same index, so it hands over to the first and quits.
const ownsInstanceLock = app.requestSingleInstanceLock();
if (!ownsInstanceLock) app.quit();

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

void app.whenReady().then(async () => {
  // A copy that lost the lock can still get here while it quits, and must not start a core.
  if (!ownsInstanceLock) return;
  denyAllPermissions();
  serveRenderer(path.resolve(__dirname, '../dist'));
  const stderrLogPath = path.join(app.getPath('userData'), 'scrb-core-stderr.log');
  const core = startCore(spawn, {
    binaryPath: coreBinaryPath(),
    hello: {
      protocol: PROTOCOL_VERSION,
      appName: app.getName(),
      appVersion: app.getVersion(),
      userDataDir: app.getPath('userData'),
      documentsDir: app.getPath('documents'),
      countryCode: app.getLocaleCountryCode() || null,
    },
    emit: sendToWindows,
    stderrLogPath,
    // A reloaded window reads the new core's state from the start.
    onRestarted: () => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.reload();
    },
    onStopped: () => {
      void dialog.showMessageBox({
        type: 'error',
        message: 'The recorder keeps stopping.',
        detail: `The details are in ${stderrLogPath}.`,
      });
    },
  });
  const backend = await openBackend(sendToWindows);
  const { playback } = backend;
  if (playback) serveMedia((request) => playback.serve(request));
  const stopPlayback = () => playback?.stop();
  registerCallHandlers({ ...backend.handlers, ...core.handlers }, isTrustedSender);
  closeBeforeQuit(app, async () => {
    await Promise.allSettled([backend.close(), core.close()]);
  });
  createMainWindow(backend.warning, backend.recovery, stopPlayback);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(backend.warning, backend.recovery, stopPlayback);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
