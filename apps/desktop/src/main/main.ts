import {
  app,
  BrowserWindow,
  dialog,
  screen,
  shell,
  systemPreferences,
  type IpcMainInvokeEvent,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC_EVENT_CHANNEL, type RecordingState } from '@scrb/contracts';
import { openBackend } from './backend.ts';
import { registerCallHandlers } from './ipc.ts';
import {
  MINI_COMPACT_HEIGHT,
  MINI_WINDOW_OPTIONS,
  createCloseGate,
  createMiniController,
  type MiniHandle,
  miniWindowOpenHandler,
  restoreMain,
  withoutMini,
} from './mini-window.ts';
import { fadeOpacity } from './mini-fade.ts';
import {
  choosePosition,
  expandedBounds,
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

// Every mini window that exists, including one fading out; none may stand in for the main window.
const miniWindows = new Set<BrowserWindow>();

// A quit closes every window, so the mini one must let it.
app.on('before-quit', () => {
  for (const window of miniWindows) {
    window.setClosable(true);
    window.destroy();
  }
});

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

function openMiniWindow(onClosedByUser: () => void): MiniHandle {
  const mini = new BrowserWindow({
    ...MINI_WINDOW_OPTIONS,
    webPreferences: secureWebPreferences(__dirname),
  });
  miniWindows.add(mini);
  const closeGate = createCloseGate();
  mini.on('close', (event) => {
    if (closeGate.blocks()) event.preventDefault();
  });
  mini.setAlwaysOnTop(true, 'floating');
  mini.setMenuBarVisibility(false);
  lockDownContents(mini.webContents, appOrigin);
  let compact = false;
  let fullHeight = 0;
  const setCompact = (next: boolean): void => {
    if (mini.isDestroyed() || next === compact) return;
    const bounds = mini.getBounds();
    if (next) {
      fullHeight = bounds.height;
      // Content height (the page's own strip is inside it); the window keeps its top edge.
      const chrome = bounds.height - mini.getContentBounds().height;
      mini.setBounds({ ...bounds, height: MINI_COMPACT_HEIGHT + chrome });
    } else {
      const area = screen.getDisplayMatching(bounds).workArea;
      mini.setBounds(expandedBounds(bounds, fullHeight, area));
    }
    compact = next;
  };
  mini.webContents.setWindowOpenHandler(
    miniWindowOpenHandler(
      () => restoreApp?.(),
      setCompact,
      () => {
        hideMini();
        // Clicking the mini window made Scribe the active app, and without it the OS hands the
        // keyboard to the main window. Hiding the app gives it back to the app used before.
        if (process.platform === 'darwin') app.hide();
      },
    ),
  );
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
    // The compact strip is not a place to remember: its top edge is the full window's.
    mini.on('moved', () => {
      if (!compact) saveMiniPlacement(mini);
    });
  });
  mini.on('closed', () => {
    cancelFade();
    miniWindows.delete(mini);
    onClosedByUser();
  });
  void mini.loadURL(`${appUrl}#mini`);
  return {
    close: () => {
      if (mini.isDestroyed()) return;
      const closeNow = (): void => {
        closeGate.allow();
        mini.setClosable(true);
        mini.close();
      };
      if (!mini.isVisible()) closeNow();
      else fadeTo(0, closeNow);
    },
    reopen: () => {
      if (mini.isDestroyed() || !mini.isVisible()) return false;
      fadeTo(1);
      return true;
    },
  };
}

let miniHidden = false;
function sendMiniHidden(window: BrowserWindow): void {
  window.webContents.send(IPC_EVENT_CHANNEL, 'miniWindowHiddenChanged', { hidden: miniHidden });
}

// The window opened below names itself `mini`, so the controller is reached through this name.
const hideMini = (): void => mini.hide();

const mini = createMiniController(openMiniWindow, (hidden) => {
  miniHidden = hidden;
  for (const window of BrowserWindow.getAllWindows()) sendMiniHidden(window);
});

function mainWindows(): BrowserWindow[] {
  return withoutMini(BrowserWindow.getAllWindows(), miniWindows);
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
  // A page that loads while the mini window is hidden must learn it, to offer the way back.
  window.webContents.on('did-finish-load', () => sendMiniHidden(window));
  window.on('closed', () => {
    if (mainWindows().length === 0) mini.mainGone();
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
  backend.handlers.showMiniWindow = () => {
    mini.show();
    return Promise.resolve();
  };
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
