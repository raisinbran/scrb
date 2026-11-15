# Plan: fix the "null origin" trust checks (SP-08), with the optional event-name check (SP-06)

**Status, 2026-11-14: draft for owner approval, independent review pending.** Plan only: no code changed. Navigation and IPC are risky areas (Development Process), so nothing is built until the owner approves this file. Source: finding SP-08 and SP-06 in `docs/qa/security-privacy-review-20261114.md` (PR #227). Code read at `main` `2eee5d8`. No contract change is needed. No real recordings were used.

## Summary for the owner

- **The problem.** The installed app checks "is this page really Scribe?" in two places: before the window may navigate somewhere, and before the main process answers a request from the page. Both checks compare a page's "origin". For Scribe's own address (`scribe://app/...`) the tool the code uses (Node's `new URL(...).origin`) cannot work out an origin and says `"null"`. It says the same `"null"` for `scribe://anything-else`, for local files (`file:`), for `data:` pages and for `about:blank`. So in the installed app the checks accept all of those as "Scribe". In the developer build the address is `http://localhost:5183`, which has a proper origin, so the checks work there. **The bug only exists in the installed app, which is the one that matters.**
- **How bad.** Real but conditional. Remote websites are still blocked (their origin is not `"null"`). The risk is a local page (a file or a `data:` page) that gets loaded into Scribe's window: it would be treated as Scribe and could ask the main process for meeting data. **I found no way for that to happen today**: the app has no links, no embedded frames, no drag-drop navigation (Electron's default is off), and the only page loaded is its own. So: a broken lock on a door nobody has found a way to reach. Worth fixing before release, not an emergency.
- **The fix.** Compare the exact address parts (scheme `scribe`, host `app`, no port) instead of "origin", reject everything else, and also require the request to come from the top frame of one of Scribe's own windows. About 40 lines of code plus tests. It also makes redirects and frames obey the same rule.
- **Risk to the app.** Low if the new rule matches the address the app really uses; the check on the installed Mac and Windows builds (section 6) proves that, and the existing packaged smoke test already exercises the call path.
- **Optional second slice (SP-06).** The main process sends events to the page by name without checking the name is on the allowed list. Purely defensive (nothing wrong today). Small, separate PR.
- **Decisions needed from you:** approve slice 1; say yes/no to slice 2; confirm that adding one explicit setting (`navigateOnDragDrop: false`, already the default) counts as strengthening, not weakening, the window settings.

## 1. What is wrong, concretely

Code: `apps/desktop/src/main/main.ts:50-56`, `security.ts:46-53`, `ipc.ts:9-22`.

| # | Comparison | Packaged build | Dev build |
| --- | --- | --- | --- |
| C1 | `appOrigin = new URL(appUrl).origin` (`main.ts:52`) | `"null"` (a non-special scheme has an opaque origin in Node, even though Chromium registers `scribe` as standard) | `http://localhost:5183` (correct) |
| C2 | `isTrustedSender`: `new URL(senderFrame.url).origin === appOrigin` (`main.ts:54-57`) | true for **any** sender URL that also parses to `"null"`: `scribe://evil/x`, `file:`, `data:`, `about:blank`, `blob:` with an opaque origin. Also **throws** (unhandled, request rejected by Electron) on an unparsable URL | correct: only that dev server |
| C3 | `will-navigate`: `new URL(url).origin !== allowedOrigin` (`security.ts:47-49`, used for main window `main.ts:257` and mini `main.ts:123`) | navigation to `scribe://evil`, `file:`, `data:` is **allowed**; `http(s):` is still blocked. Throws on an unparsable URL | correct |
| C4 | no `will-redirect` or `will-frame-navigate` handler | not covered either build | not covered |
| C5 | `senderFrame` may be a subframe or a window that is not ours | accepted if the URL passes C2 | same |

**Reproduction (run 2026-11-14, Node 22, no Electron needed):**

```
scribe://app/index.html -> null    scribe://evil/x -> null    file:///tmp/a.html -> null
data:text/html,x -> null           about:blank -> null        http://localhost:5183/ -> http://localhost:5183
```

**What a "null" page could do in the packaged build, if it got loaded into the main or mini window.** The preload (`preload.ts`) runs in that page, so `window.scribeBridge.invoke(...)` works, and C2 passes, so main would run any allowlisted call with valid arguments: read transcripts and settings, export, delete meetings, change the library location. The per-call allowlist and request validation (`dispatch.ts`) still apply, so this is the app's normal surface, not Node access. A `file:` or `data:` page also does not inherit the app's CSP (it is injected into the built `index.html` only, `vite.config.ts`). Remote content cannot do this (origin differs).

**Entry path: not established.** Checked: (a) no `<a href>` or `window.open` to outside content, the open handler denies everything (`security.ts:51`); (b) `default-src 'self'` and no `frame-src` means no foreign frames, and the preload does not run in subframes (`nodeIntegrationInSubFrames` is not set), so a sandboxed or `srcdoc` iframe would have no bridge; (c) drag-drop navigation is off by default in Electron 45; (d) `loadURL` calls are fixed (`main.ts:193,315`); (e) a hostile `scribe://evil` URL would hit `serveRenderer` which 404s any host other than `app` (`security.ts:22`), but the preload still runs on that 404 page and C2 would pass: harmless only because the page has no script. The only plausible routes are a future link or iframe feature, or a cross-site-scripting hole in the renderer (which already runs as Scribe, so C3 matters only to stop a *different* local page from replacing it).

## 2. The smallest fix (slice 1)

All inside `apps/desktop/src/main/`; the renderer, preload, contract and `web-preferences.ts` rules stay as they are.

1. **New pure module `app-trust.ts`** (no Electron import, so tests can run it). One function, `isAppUrl(candidate: string, expected: URL): boolean`: parse inside `try/catch` (false on error); return true only if `protocol`, `hostname` and `port` equal the expected URL's and there is no `username`/`password`. No use of `.origin`. Expected values: `scribe:` / `app` / `""` packaged; `http:` / `localhost` / `5183` in dev. Hostnames of non-special schemes are not lower-cased by Node, so `scribe://APP/` is rejected; Chromium lower-cases standard-scheme hosts in `senderFrame.url`, so the real app never sends that (verified in section 6).
2. **Trust helper used by production, in the same module.** `app-trust.ts` also exports `isTrustedSenderEvent(event, trust: { appUrl: URL; owned: ReadonlySet<number> })`: `event.senderFrame` exists, **is the top frame** (`event.senderFrame === event.sender.mainFrame`), `event.sender.id` is in `owned` (ids of the main and mini `webContents`, added where the windows are created, `main.ts:114,255`), and `isAppUrl(senderFrame.url, appUrl)`; any error means "not trusted". `main.ts` deletes its own `appOrigin` and `isTrustedSender` body and passes `(event) => isTrustedSenderEvent(event, trust)` to `registerCallHandlers`; it keeps no origin comparison of its own. The helper takes plain objects, so tests can call it without Electron.
3. **`security.ts` `lockDownContents(contents, appUrl: string)`**: use `isAppUrl` in `will-navigate`, and add the same check on `will-redirect` and `will-frame-navigate` (`preventDefault()` when false). Keep the deny-all `setWindowOpenHandler` and the `will-attach-webview` block. Update the two callers and the one existing test that passes `'scrb://app'` (`mini-window.test.ts:265`).
4. **`web-preferences.ts`**: add `navigateOnDragDrop: false` explicitly (same value as the current default; pinned so an Electron default change cannot reopen it). This strengthens, never weakens; owner to confirm in the decisions above. Print window is unchanged.
5. Nothing else: no new IPC channel, names still allowlisted in preload and in `dispatch.ts`, sandbox/contextIsolation/no-node untouched, `ipc.ts` unchanged (it already takes the predicate).

Considered and rejected: `protocol.registerSchemesAsPrivileged` cannot change Node's `.origin`; comparing `url.href` prefixes is easier to get wrong than explicit parts; moving the check into the protocol handler does not cover IPC senders.

## 3. Tests (all `npm run check`, no Electron)

New `app-trust.test.ts` (and sender cases through `registerCallHandlers` with fake events in a new `ipc.test.ts`; none exists today):

- **Tests must call the production code, not a copy.** Every test below imports `isAppUrl`, `isTrustedSenderEvent` and `lockDownContents` from the same modules `main.ts` imports; no test re-implements the comparison or injects its own predicate. A small guard test reads `main.ts` and `security.ts` source and fails if either contains `.origin` or defines its own trust function, so the helper cannot be bypassed by editing `main.ts` alone. `ipc.test.ts` registers the real `registerCallHandlers` with the real helper (fake `ipcMain` and events).
- **Fails today (proves the bug):** commit 1 only moves the current logic, unchanged, into `isTrustedSenderEvent` / `lockDownContents` (behavior identical, `main.ts` now calls the helper) and adds the tests below. Run against that commit, the table for the packaged address `scribe://app/index.html` shows `scribe://evil/x`, `file:///tmp/a.html`, `data:text/html,x` and `about:blank` accepted, so those cases fail in CI. Commit 2 is the fix and turns them green.
- Frame ownership and legitimate URLs, through `isTrustedSenderEvent` with the packaged expected URL: top frame of an owned window at `scribe://app/index.html` is accepted; same URL from a subframe or an unowned `sender.id` is refused. Accept: `scribe://app/index.html`, `scribe://app/index.html#mini`, `scribe://app/` (packaged); `http://localhost:5183/` and `…/#mini` (dev expected).
- Reject: other hosts, `scribe://app:80`, `scribe://user@app`, `scribe://APP`, `file:`, `data:`, `about:blank`, `about:srcdoc`, `blob:`, `javascript:`, `http://localhost:5184`, `""`, `"not a url"`, `undefined` frame.
- IPC: subframe sender (frame is not `sender.mainFrame`) refused; sender not in the owned set refused; refusal returns the existing generic envelope and the handler is not called; a thrown parse error is refused, not propagated.
- Navigation: a fake `WebContents` records listeners; `will-navigate`, `will-redirect`, `will-frame-navigate` each `preventDefault` for `file:`/`scribe://evil`/`https://example.com` and do not for `scribe://app/index.html#x`.
- `web-preferences.test.ts`: `navigateOnDragDrop === false`; the existing locked-settings assertions still pass.
- Packaged-build check: extend `e2e/packaged.spec.ts` (runs when `SCRB_PACKAGED_APP` is set) to assert `page.url()` starts `scribe://app/`, the existing `invoke` calls still succeed (proves C2 now passes for the real app), and `page.evaluate(() => location.href = 'file:///etc/hosts')` leaves the URL unchanged. Not run in ordinary CI; run by the owner or an agent on an installed build.

## 4. What could break the app's own pages

- **Address mismatch.** The page is served by `protocol.handle('scribe', …)` at `scribe://app/index.html`, loaded by `window.loadURL(appUrl)` and `mini.loadURL(appUrl + '#mini')`. If Electron reports the sender URL in some other form on a platform (for example a trailing port or upper case), every IPC call would be refused and the app would show errors on all screens. This is the main risk and the reason for the installed-build checks on both systems before merge.
- **Redirect / frame handlers** could block a navigation the app relies on; the app has none beyond reload and hash changes (`#mini`), which stay on `scribe://app`.
- **Owned-window set** must include windows created later (mini reopened after close). Test: open mini, close, reopen; calls still work.
- **Dev server.** The expected URL is `SCRB_DEV_SERVER_URL` (unpackaged only); a non-default port still works because the port is compared to that value.
- **Fail-closed behaviour** means a mistake shows up immediately (blank errors), not as a silent hole.

## 5. Optional slice 2: SP-06, runtime event-name check in main

Separate PR, after slice 1 (touches `main.ts`, which slice 1 also edits). Add one helper `sendEvent(contents, name, payload)` in `main/events.ts`: `if (!EVENT_NAMES.includes(name)) return;` then `contents.send(IPC_EVENT_CHANNEL, name, payload)`. Use it at `main.ts:215` and `:337` (the only two `send` sites; `grep` confirms none elsewhere). Tests: allowed name is sent once on the one channel; an unknown name (cast) is dropped and not sent. Payload validation is not included (needs contract work, owner approval). No new channel; preload already checks names on its side.

## 6. Owner-run check in the installed build (Mac and Windows)

Run after the PR's automated checks pass and the installed app is built from the PR branch by an agent (steps only after that).

1. Install and open the app normally. **Expect:** it opens on the Recordings screen with no error banner; Settings opens and shows your library folder; Vocabulary opens. (This proves the app's own page is still trusted.) If any screen shows "Request refused", stop: that is the failure this plan guards against; do not merge.
2. Click **Show mini window** / start a short test recording of an invented clip (under 20 minutes), confirm the small window shows status, stop it, then reopen the small window once. **Expect:** works every time.
3. Quit and reopen. **Expect:** same as step 1.
4. Agent-run on the same installed build (owner starts it, no recordings needed): `SCRB_PACKAGED_APP=<path to the installed Scribe executable>` then `npm run test:smoke -- packaged.spec.ts`. Mac path: `…/Scribe.app/Contents/MacOS/Scribe`. Windows path: `…\win-unpacked\Scribe.exe` (or the installed `Scribe.exe`). **Expect:** the test passes, including the new "a `file:` navigation does not change the address" check.
5. Record the Mac and Windows results (OS version, pass/fail) in the PR; Windows is Regiurn or BCHEN-W10, named. Do not rerun a failure automatically; report it.

## 7. Process

One PR per slice, each a draft; independent review (other than the author) before merge; no merge by an agent; contract untouched (no approval needed beyond this plan); no real recordings. Slice 1 scope is small enough for one session; tests first.
