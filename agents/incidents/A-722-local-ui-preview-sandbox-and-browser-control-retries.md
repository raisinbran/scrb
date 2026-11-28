### A-722 — 2026-11-17 — Codex / MacBook Air M5 — local main UI preview needed sandbox bind and browser-control correction

- **Status / attribution:** Confirmed agent-caused setup and interaction errors; no product defect.
- **What failed:** The first Vite launch attempted to bind the default IPv6 localhost interface and returned `listen EPERM`. After starting Vite on `127.0.0.1` with the required permission, I first used native accessibility click calls against a DOM-only browser tab; those calls were rejected because the tab requires Playwright locators. A later source lookup also used the wrong `TitleBar.tsx` path and returned a file-not-found result.
- **Impact:** One failed local server start, two ineffective browser-control attempts, and one failed source lookup; no source or installed-app changes.
- **Correction / remaining risk:** Started the current `origin/main` preview on loopback only, then used documented Playwright controls and verified the main UI. Low.
