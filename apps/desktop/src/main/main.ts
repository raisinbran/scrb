import { app, BrowserWindow, dialog, screen, shell, systemPreferences, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC_EVENT_CHANNEL, type RecordingState } from '@scrb/contracts';
import { openBackend } from './backend.ts';
import { registerCallHandlers } from './ipc.ts';
import {
  createMiniController,
  miniWindowOpenHandler,
  restoreMain,
  withoutMini,
} from './mini-window.ts';
import { fadeOpacity } from './mini-fade.ts';
import {
  choosePosition,
  parsePlacement,
  serializePlacement,
  type DisplayInfo,
} from './mini-placement.ts';
import { closeBeforeQuit } from './quit.ts';
import {
  APP_ORIGIN,
  denyAllPermissions,
  lockDownContents,
  registerAppScheme,
  serveMedia,
  serveRenderer,
} from './security.ts';
import { secureWebPreferences } from './web-preferences.ts';
import { pinUserData } from './packaged-setup.ts';

// The app was renamed to Scribe, but its data stays where the saved library location and settings
// already are. Pinned before anything reads userData; a test's --user-data-dir still wins.
if (!app.commandLine.hasSwitch('user-data-dir')) pinUserData(app);

// Ignored in packaged builds, so the environment can never point the app at another page.
const devServerUrl = app.isPackaged ? undefined : process.env['SCRB_DEV_SERVER_URL'];
const appUrl = devServerUrl ?? `${APP_ORIGIN}/index.html`;
const appOrigin = new URL(appUrl).origin;

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  return url !== undefined && new URL(url).origin === appOrigin;
}

let miniWindow: BrowserWindow | null = null;

const miniPlacementFile = (): string => path.join(app.getPath('userData'), 'mini-window.json');

function displayInfos(): DisplayInfo[] {
  return screen.getAllDisplays().map(({ id, workArea }) => ({ id, workArea }));
}

function readMiniPlacement() {
  try {
    return parsePlacement(fs.readFileSync(miniPlacementFile(), 'utf8'));
  } catch {
    return null;
  }
}

function saveMiniPlacement(mini: BrowserWindow): void {
  const bounds = mini.getBounds();
  try {
    fs.writeFileSync(
      miniPlacementFile(),
      serializePlacement({
        x: bounds.x,
        y: bounds.y,
        displayId: screen.getDisplayMatching(bounds).id,
      }),
    );
  } catch {
    // Losing the remembered spot only costs the default position next time.
  }
}

const prefersReducedMotion = (): boolean =>
  systemPreferences.getAnimationSettings().prefersReducedMotion;

function openMiniWindow(onClosedByUser: () => void): { close(): void } {
  const mini = new BrowserWindow({
    title: 'Scribe recording',
    width: 264,
    height: 72,
    // The size is the page area, so the title bar never takes from the two rows.
    useContentSize: true,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: secureWebPreferences(__dirname),
  });
  miniWindow = mini;
  mini.setAlwaysOnTop(true, 'floating');
  mini.setMenuBarVisibility(false);
  lockDownContents(mini.webContents, appOrigin);
  mini.webContents.setWindowOpenHandler(miniWindowOpenHandler(() => restoreApp?.()));
  let opacity = 0;
  let cancelFade: () => void = () => undefined;
  const fadeTo = (to: number, done?: () => void): void => {
    cancelFade();
    cancelFade = fadeOpacity({
      from: opacity,
      to,
      reducedMotion: prefersReducedMotion(),
      setOpacity: (value) => {
        opacity = value;
        if (!mini.isDestroyed()) mini.setOpacity(value);
      },
      ...(done ? { done } : {}),
    });
  };
  // It carries status only; it must not take the keyboard from the app being used.
  mini.once('ready-to-show', () => {
    // Placed with the real outer size (title bar included), then shown transparent and faded in.
    const { width, height } = mini.getBounds();
    const primary = screen.getPrimaryDisplay();
    const { x, y } = choosePosition(
      readMiniPlacement(),
      displayInfos(),
      { id: primary.id, workArea: primary.workArea },
      { width, height },
    );
    mini.setPosition(x, y);
    mini.setOpacity(0);
    mini.showInactive();
    fadeTo(1);
    // Only after the placement above, so the default is not saved as if the user chose it.
    mini.on('moved', () => saveMiniPlacement(mini));
  });
  mini.on('closed', () => {
    cancelFade();
    if (miniWindow === mini) miniWindow = null;
    onClosedByUser();
  });
  void mini.loadURL(`${appUrl}#mini`);
  return {
    close: () => {
      if (mini.isDestroyed()) return;
      if (!mini.isVisible()) mini.close();
      else fadeTo(0, () => mini.close());
    },
  };
}

const mini = createMiniController(openMiniWindow);

function mainWindows(): BrowserWindow[] {
  return withoutMini(BrowserWindow.getAllWindows(), miniWindow);
}

/** Any main window that is visible and has the keyboard. */
function refreshMainInFront(): void {
  mini.setMainInFront(
    mainWindows().some(
      (window) => window.isVisible() && !window.isMinimized() && window.isFocused(),
    ),
  );
}

function createMainWindow(
  warning: string | null = null,
  recovery: { kind: 'blocked' | 'retainedCopy'; folder: string } | null = null,
  stopPlayback: () => void = () => undefined,
): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 12, y: 12 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#808080', height: 40 } }),
    webPreferences: secureWebPreferences(__dirname),
  });
  lockDownContents(window.webContents, appOrigin);
  // A reloaded or lost page cannot release what it was granted, so grants end here.
  window.webContents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) stopPlayback();
  });
  window.webContents.on('render-process-gone', stopPlayback);
  window.on('closed', stopPlayback);
  window.on('focus', refreshMainInFront);
  window.on('blur', refreshMainInFront);
  window.on('show', refreshMainInFront);
  window.on('hide', refreshMainInFront);
  window.on('minimize', refreshMainInFront);
  window.on('restore', refreshMainInFront);
  window.on('closed', () => {
    // Elsewhere the app quits with its last main window; the mini one must not keep it alive.
    if (process.platform !== 'darwin') mini.dispose();
    else refreshMainInFront();
  });
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
if (!app.requestSingleInstanceLock()) app.quit();

// Set once the backend is open; a second launch before then has nothing to restore.
let restoreApp: (() => void) | null = null;

app.on('second-instance', () => restoreApp?.());

void app.whenReady().then(async () => {
  denyAllPermissions();
  serveRenderer(path.resolve(__dirname, '../dist'));
  const backend = await openBackend((name, payload) => {
    if (name === 'recordingStateChanged') mini.setStatus((payload as RecordingState).status);
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_EVENT_CHANNEL, name, payload);
    }
  });
  const { playback } = backend;
  if (playback) serveMedia((request) => playback.serve(request));
  const stopPlayback = () => playback?.stop();
  registerCallHandlers(backend.handlers, isTrustedSender);
  closeBeforeQuit(app, backend.close);
  createMainWindow(backend.warning, backend.recovery, stopPlayback);
  // The mini window does not count as the app: with only it open, a second launch or the dock
  // must bring the main window back through this same path.
  restoreApp = () =>
    restoreMain(
      mainWindows(),
      (window) => {
        if (window.isMinimized()) window.restore();
        window.focus();
      },
      () => createMainWindow(backend.warning, backend.recovery, stopPlayback),
    );
  app.on('activate', restoreApp);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
