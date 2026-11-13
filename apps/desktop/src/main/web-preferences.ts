import path from 'node:path';

/** Every window gets exactly these, so a new window cannot weaken the Electron settings. */
export function secureWebPreferences(dir: string) {
  return {
    preload: path.join(dir, 'preload.cjs'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
  } as const;
}
