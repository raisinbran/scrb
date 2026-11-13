# Mini window: speaker indicator (done) and "Show Scribe" button (needs approval)

## Done in this PR (no approval needed)
Status row no longer hops (fixed second slot), window 240x72, last-speaker label from existing `transcriptChanged` events (label only, no text). No contract, IPC or preload change.

## Proposed, NOT implemented: a "Show Scribe" button
Owner now wants a quick way from the mini window back to the main app. This reverses the 2026-11-13 "no Show app button" decision in `docs/plans/ui-m1-fixes.md` item C. It touches window/navigation handling in main, so per AGENTS.md it waits for owner approval.

### Option A (recommended): no new IPC
The button is a plain link/`window.open('scrb-app://show-main')` from the mini renderer. In `main.ts`, only on the **mini** `webContents`, the existing lockdown's `setWindowOpenHandler` / `will-navigate` recognises that exact URL, denies the navigation, and calls the existing `restoreApp` (focus a main window, or create one).
- No new call or event name, no contract change, no preload or allowlist change; the one-call-channel / one-event-channel rule is untouched.
- Trigger is bound to the mini window's own `webContents` (identity check in main, not a renderer-supplied claim). The main renderer has no such handler, so it cannot cause this or anything else through it.
- No payload: the URL is constant; any other URL keeps today's deny behaviour.
- Reveals nothing: it only focuses a window; no data crosses back to the renderer, so no transcript text.
- Worst case if the mini renderer were compromised: it can raise the Scribe window (it can already do nothing else). Nothing a main-window script can reach changes.
- Tests: unit test of the handler (exact URL focuses main/creates one; other URLs and the main window's webContents are denied); UI test that the button renders; smoke unchanged.

### Option B: new allowlisted call `showMainWindow`
Needs a contract addition (owner approval), entries in preload and main allowlists, mock backend parity, and a sender check restricting it to the mini window. Larger surface and any renderer could call it unless the sender check is right. Not recommended.

### Decision: owner approved Option A (implemented in this PR)
Approve Option A, B, or neither. Review by an agent other than the author is required before merge.
