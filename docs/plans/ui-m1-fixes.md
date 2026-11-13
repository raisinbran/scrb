# Plan: UI fixes before M1 (word highlight, window size, recording mini-window)

**Status:** proposed 2026-11-13 from owner comments; needs independent review and owner approval before any code. UI code stays in `apps/desktop/src/ui/`; the mini-window is Electron main-process work (item C), which `AGENTS.md` lists as a risky change.
Owner decisions already given: the inspector stays a placeholder; the word highlight is a darker current word on default-colour text, not a loud highlight; a high-contrast option is welcome but optional.

## A. Word highlight that follows playback

**Today** (`TranscriptTab.tsx`): clicking a word calls `onPlay(word.startMs)`, but only the whole segment is marked (`segmentActive`, `aria-current`). No word is marked.

**Change** (UI only, no contract change): `TranscriptWord` already has `startMs` and `endMs`.

- Find the current word from `positionMs` inside the active segment only (binary search on `startMs`; the current word is the last one with `startMs <= positionMs`, cleared past the segment's last `endMs`). Show it while playing or paused after a click.
- Style: all transcript words use a muted but AA-passing grey; the current word uses the primary text colour (near black in light theme). Two new tokens in `theme/tokens.css` (`--color-word-idle`, `--color-word-current`), because colours live only there and a test enforces AA contrast for each pair in both themes.
- Keep the existing segment bar. Do not re-render other segments on each position tick (`SegmentRow` is memoised; pass `currentWordId` only to the active row).
- Keyboard and screen readers: no change to focus order; mark the current word with `aria-current="true"` on its span.
- Out of scope: a high-contrast mode. The two tokens make it a later one-block override.

**Tests:** model test for the word lookup (start, middle, between words, past end, empty segment); a component test that exactly one word is current and that a click makes the clicked word current; the existing token/contrast test covers the new colours. Mock backend stays contract-exact.

## B. Smaller minimum window

**Today:** `main.ts` sets `minWidth: 1024`, `minHeight: 640` (opens at 1280x800). The UI spec says "usable at 1280x720 and up; the inspector collapses automatically on narrow windows" and does not justify 1024.

**Change:** lower the minimum to 800x560 in `main.ts` only if every screen (Live, Recordings with detail, Speakers, Vocabulary, Settings, Help) shows no clipped or overlapping controls at that size in a browser check on the mock (viewport 800x560, inspector auto-collapsed). If one fails, fix that layout if it is a one-line CSS change; otherwise use the smallest passing size and report it. Add a viewport test for the inspector auto-collapse threshold if one is missing. Not a security setting.

## C. Recording mini-window

**Goal:** while recording, if the main window is not in front (blurred, minimised or hidden), show a small always-visible window with the recording status, like a Teams or Discord call; it has normal window controls and can be dismissed.

**Design, smallest version:**

- Main process opens one small `BrowserWindow` (about 280x120, `alwaysOnTop: 'floating'`, native frame with minimise and close, not resizable, no menu). Same `webPreferences` as the main window (context isolation, sandbox, no node integration), same preload, same single call channel and single event channel, **no new IPC names**, `lockDownContents` applied, and `isTrustedSender` extended to accept it by origin.
- It loads the existing renderer at a separate route (`scribe://app/#mini`) that renders only: recording dot, "Recording" / "Paused", elapsed time (extrapolated from `recordingStateChanged.elapsedMs` between events), and a warning line from `recordingHealth` when the level is not ok. It uses the events the main window already receives (they are already sent to every window).
- **Shows no transcript text.** Meeting content floating over other apps could be exposed in a screen share; status and time are enough to know a recording is on.
- Shown when `recordingState.status` is `recording` or `paused` **and** the main window is blurred, minimised or hidden; hidden when the main window regains focus, when recording stops, or when the user closes it. Closing it does **not** stop the recording and it stays closed for that recording (reopens on the next one). An OS-level "covered by another window" signal is not available in Electron; loss of focus is the proxy, so a main window that is visible but unfocused behind a full-screen app also triggers it.
- Quit: the mini closes with the app; `closeBeforeQuit` behaviour is unchanged.
- **Optional, needs owner approval because it adds a contract call:** a "Show app" button (needs a new call name, hence a contract change and allowlist entries in preload and main). Without it, the user returns to the app from the dock or taskbar.

**Tests:** a unit test of the show/hide rule (status x focus x dismissed, as a pure function); an integration test that the mini window is created with the locked-down `webPreferences` and that its renderer cannot call anything the main window cannot; the existing Electron-settings tests extended to cover it; the smoke test launches headless and checks the window opens on a fake recording state if the dev backend allows; a UI test of the mini route with the mock backend. Manual check on Mac, and a Windows check by the owner or CI smoke (Windows title-bar overlay differs from macOS traffic lights).
**Risks:** extra window on screen readers (give it a clear label and make it not steal focus: `showInactive()`); on macOS full-screen apps the floating level may not appear over them; both reported, not hidden.

## Order and cost

1. B (about 1 h including the size check), 2. A (about 2 h), 3. C (about 3 to 4 h, separate PR after this plan is approved, with its own independent code review). A and B are small UI-side PRs; C changes Electron settings, so it gets its own review.

## Governance

Plan review by an agent other than the author, then owner approval; code on `cuc/` branches; automated checks, including `prettier --check` on each changed TypeScript file, before independent code review; no merge without the owner. Record usage rows and any agent error in the agents registers.
