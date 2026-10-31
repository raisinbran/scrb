import { app, BrowserWindow, dialog, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { IPC_EVENT_CHANNEL } from '@scrb/contracts';
import { openBackend } from './backend.ts';
import { registerCallHandlers } from './ipc.ts';
import { closeBeforeQuit } from './quit.ts';
import {
  APP_ORIGIN,
  denyAllPermissions,
  lockDownContents,
  registerAppScheme,
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

function createMainWindow(
  warning: string | null = null,
  recovery: { kind: 'blocked' | 'retainedCopy'; folder: string } | null = null,
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
  window.once('ready-to-show', () => {
    window.show();
    if (recovery) {
      const available = recovery.kind === 'retainedCopy';
      const buttons = available
        ? ['Continue', 'Retry cleanup', 'Open library folder', 'Keep copies and close']
        : ['Retry verification', 'Open library folder', 'Keep copies and close'];
      void dialog.showMessageBox(window, {
        type: 'warning',
        title: 'Index recovery',
        message: warning ?? 'The library index needs review.',
        detail: available
          ? 'The verified live library remains available; an older index copy may still contain data.'
          : 'The library is unavailable until the index is verified. No file was restored or discarded.',
        buttons,
        cancelId: buttons.length - 1,
        noLink: true,
      }).then(async ({ response }) => {
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
if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

void app.whenReady().then(async () => {
  denyAllPermissions();
  serveRenderer(path.resolve(__dirname, '../dist'));
  const backend = await openBackend((name, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_EVENT_CHANNEL, name, payload);
    }
  });
  registerCallHandlers(backend.handlers, isTrustedSender);
  closeBeforeQuit(app, backend.close);
  createMainWindow(backend.warning, backend.recovery);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(backend.warning, backend.recovery);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
