# Gate 7 automated walkthrough, Windows (2026-11-15)

**Spec:** `apps/desktop/e2e/real-gate7-walkthrough.spec.ts`, the same spec as the [Mac run](gate-7-mac-walkthrough-20261114.md). **Machine:** BCHEN-WIN10 (Windows 11 Pro for Workstations, no admin), dev build (`npm run build`, then Playwright driving Electron). **Data:** invented speech made with the built-in Windows speech voice (`System.Speech`, never committed) and invented seeded meetings. No real recordings.

Run it from `apps/desktop` (Git Bash shown; first test needs the real-mode assets, the second needs nothing):

```bash
SCRB_CAPTURE_HELPER=<repo>/native/windows-capture/build/bin/scrb-capture.exe \
SCRB_FINAL_PASS_CONFIG=$HOME/scrb-dev-assets/config/final-pass.json \
SCRB_LIVE_CONFIG=$HOME/scrb-dev-assets/config/live.json \
npx playwright test e2e/real-gate7-walkthrough.spec.ts
```

## Result

```
ok 1 import, search, export both formats, then fully delete (29.1s)
ok 2 auto-delete removes exactly the chosen data (3.1s)
2 passed (32.9s)
```

Probe word used for search: `lanterns`. The first attempt, before the spec had a Windows speech step, failed in 9 ms with `spawnSync say ENOENT` (the spec called macOS `say`); test 2 passed then too.

## What changed for Windows (test code only)

The spec had three macOS-only steps. Each now branches on `process.platform`; the macOS path is unchanged.

| Step | macOS | Windows |
| --- | --- | --- |
| Invented speech | `say`, `afconvert` | PowerShell `System.Speech`, 16 kHz mono 16-bit WAV (built in, nothing installed) |
| DOCX text | `unzip -p` | `fflate` `unzipSync` |
| PDF text | PDFKit via `osascript` | `pdfjs-dist` text extraction |

Added devDependencies in `apps/desktop`, exact versions: `pdfjs-dist` 5.6.205 (its Node range includes the repo's 22.12 floor; 5.7 and later need 22.13) and `fflate` 0.8.3 (already pinned in `packages/export`). `package-lock.json` changed; `npm install` here also dropped `"peer": true` flags from other entries (npm-version noise).

## What it proves

Same as the Mac run, on Windows: real import, real final pass, real export, real delete through the real Electron UI; and the real startup sweep for auto-delete on a seeded library. DOCX text (`word/document.xml`) and PDF text (pdf.js text layer) each contain every transcript word, in order (the spec asserts this and it passed, with more than 15 transcript words). Honest limit: this is a word-order check on normalised words. **Layout and formatting were not checked.** After delete, `meetings/` was empty and no path or byte content in the library (outside `logs/`) named the meeting id.

## Findings

- No product bug found on Windows. No Electron security setting was touched.
- The spec was Mac-only in three places (above), not just the PDF step.
- `npm run check`: typecheck and lint pass. `npm test` has 7 failures, all in `scripts/long-run-report.test.mjs`; the same 7 fail on a clean `origin/main` on this machine, so they are not from this change. Cause not investigated.
- The ffmpeg and ffprobe used are an earlier build from the Gate 3 evidence folder (FFmpeg n9.0, Opus 1.6.1, same SHA-256 as its `SHA256SUMS.txt`), copied per step 6 of `docs/plans/windows-m1-run.md` instead of compiling. They are not the output of `build-ffmpeg.sh` run today.
- Setup done here (nothing committed): whisper.cpp CPU static build, `scrb-sherpa.exe` compile (prints usage), the two config files, `.bin` contents.

## What Gate 7 still needs

- **Manual (owner):** open both exports in Word and a PDF viewer and judge layout; confirm the Delete confirmation wording and the auto-delete setting in the Settings screen (the spec seeds the setting through storage, not the Settings UI).
- The "exactly the chosen data" gaps listed in the Mac doc are unchanged: a meeting recording, importing or summarising during a sweep or delete; delete interrupted by a crash; permission-denied or locked files; summary and vocabulary/voice-profile links; symlinks; index-upgrade backups. Windows file locking is not exercised by this walkthrough.
- The speech is a synthetic voice, so the final pass saw clean speech only.
- Independent review pending.
