# REGIURN packaged Windows check of the SP-08 null-origin fix: 2026-11-14

**Tested commit:** `4b5b967c` (main at task start, includes PR #240).
**Plan section:** `docs/plans/null-origin-trust-fix.md` section 6.
**Environment:** Windows 11 Home 10.0.26300, PC REGIURN, Node 26.13.0 (the `node` on PATH), Electron 45.2.1.

## Results

1. **`npm run check`: FAIL.** 1 test file failed, 113 passed, 6 skipped. 4 tests failed, 1693 passed, 77 skipped. All four failures are in `scripts/long-run-report.test.mjs` (`overnight.mjs --report on synthetic evidence`): each got an empty `result` instead of the expected `RESULT: ...` line. Two seen in the output tail:
   - `expected '' to be 'RESULT: INCONCLUSIVE'` (`long-run-report.test.mjs:87`)
   - `FAILS a marked 8 ms gap on the meeting track`: `expected '' to be 'RESULT: FAIL'` (`:98`)

   Not rerun and not investigated. The failing tests are not related to the origin check, but the cause (Windows, Node 26 or a real regression) is unknown. `npm install` also rewrote `package-lock.json` (53 lines removed); that change was discarded and is not in this PR.
2. **`scripts/package-win.ps1`: pass, first attempt.** No Scribe process was running. Printed `Built: ...\apps\desktop\release\win-unpacked\Scribe.exe`. Unsigned, as expected.
3. **Packaged spec: pass.** `SCRB_PACKAGED_APP=...\win-unpacked\Scribe.exe`, `npm run test:smoke -- packaged.spec.ts`: 1 passed (5.8 s). It includes the check that `location.href = 'file:///etc/hosts'` leaves the page on `scribe://app/...`.
4. **Launch: pass, no "Request refused".** Tools and models are not installed, so the app shows `Setup incomplete` and `Cannot record yet` (missing tools and models listed, as in `regiurn-packaged-check-20261113.md`). Driven through Playwright on a throwaway profile with an invented library folder; the first-run location dialog was dismissed through the bridge, as the spec does. Page URL stayed `scribe://app/index.html`.
   - Recordings: opens, "No recordings yet", no "Request refused".
   - Vocabulary: opens, "No terms yet", no "Request refused".
   - Settings: opens (Audio, Preset, Voice Isolation sections), no "Request refused".
   - Observation, not from this fix: the Live screen lists microphones (Built-in Microphone, USB Conference Headset, Wireless Earbuds) that look like mock device data in a build with no tools. Not investigated.
5. **Owner-run steps 2 and 3 (short recording, mini window reopen, quit and reopen): NOT RUN.** They need models and a person. No recording was started.

## Not covered

Installed (non-`win-unpacked`) build, mini window, any recording.

**Independent review: pending.**
