import { app, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { registerCallHandlers } from './ipc.ts';
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

function createMainWindow(): void {
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
  window.once('ready-to-show', () => window.show());
  void window.loadURL(appUrl);
}

registerAppScheme();

void app.whenReady().then(() => {
  denyAllPermissions();
  serveRenderer(path.resolve(__dirname, '../dist'));
  registerCallHandlers({}, isTrustedSender);
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
