import path from 'node:path';

/** Every window gets exactly these, so a new window cannot weaken the Electron settings. */
export function secureWebPreferences(dir: string) {
  return {
    preload: path.join(dir, 'preload.cjs'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    navigateOnDragDrop: false,
  } as const;
}

/** The hidden print window: the locked settings, no preload and no scripts, so a page cannot act. */
export function printWebPreferences() {
  return {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    javascript: false,
  } as const;
}
