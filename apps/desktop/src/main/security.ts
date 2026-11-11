import { net, protocol, session, type WebContents } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MEDIA_SCHEME } from './playback-media.ts';

export const APP_SCHEME = 'scribe';
export const APP_ORIGIN = `${APP_SCHEME}://app`;

/** Must run before `app.ready`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    // Audio elements only: `stream` allows Range playback, and fetch stays unsupported.
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } },
  ]);
}

/** Serves the built renderer from `rootDir`, refusing anything that escapes it. */
export function serveRenderer(rootDir: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const resolved = path.resolve(rootDir, relative);
    if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}

/** Serves granted audio. Kept apart from the renderer scheme, which never dispatches media. */
export function serveMedia(handler: (request: Request) => Promise<Response>): void {
  protocol.handle(MEDIA_SCHEME, handler);
}

/** The app is offline and never asks the web layer for anything; native workers capture audio. */
export function denyAllPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
}

/** Blocks navigation away from the app, new windows and webviews. */
export function lockDownContents(contents: WebContents, allowedOrigin: string): void {
  contents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== allowedOrigin) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
