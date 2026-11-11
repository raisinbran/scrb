# Cloud QA fixes 2 — Batch 4 merge and E1–E7 handoff

**Date:** 2026-10-31 (America/Los_Angeles). **Status:** Preliminary, Claude Code QA required.  
**Branch:** `rosmont/cloud-tasks-18-21-25-28-29-33-35-36-20261031`  
**PR:** [#8](https://github.com/raisinbran/scrb/pull/8) — remains **draft**.  
**Merged origin/main:** `bd14d8b9d2234c280c07594e6c36452b7272669d` (Batch 4).  
**Validated code head:** `e2b6bcba60d676e60d019886ddcf7c202f02fc6a`.

## Commits and fixes

- `9e221d6` — Two-parent merge of latest origin/main containing Batch 4. Preserved
  Batch 4 stream-recovery changes while retaining the cloud branch's import-preemption and
  recording-busy behavior. No changes to `packages/contracts/`.
- **E1:** `007d5b0` — `SummaryCoordinator` accepts the same `recordingBusy` style
  callback as import coordination; checks before generation and after the asynchronous
  meeting lookup. Returns a `conflict` `ContractError` for a different ready meeting
  while another meeting is recording. The backend injects `recording?.isBusy()`.
- **E2:** `44200cd` — Removed unsupported `cache` fetch option from
  `packages/app-core/src/model-download.ts`.
- **E7:** `bff796f` — PDF HTML staging now uses a private UUID-named directory under
  `library.paths.cache`, passed to `printPdf` only within desktop main code.
  Successful and failed prints remove their files. At backend startup,
  `cleanupOrphanPdfPrints` removes only matching, app-owned UUID directories.
- **E3/E5/E6:** `5c87e08` — Converted the real Electron large-PDF harness to CommonJS
  with `app.whenReady().then(...)` and no top-level await, installed an empty
  `window-all-closed` handler, checked that the scripted title never became
  `SCRIPT_RAN`, ignored the generated `apps/desktop/e2e/pdf-printer-test-bundle.cjs`,
  and removed the branch-specific CI regression-mutation step. The standalone
  `scripts/prove-cloud-regressions.mjs` remains runnable manually.
- **E4 and generic CI:** `5e6c4d9`, `69ed040`, `1e59620`, `458c28c` —
  Applied the exact Prettier formatting reported by CI to changed TypeScript,
  JavaScript and Markdown. The generic changed-text Prettier gate now checks all
  supported text extensions; no branch-named CI step remains.
- **Necessary CI corrections:** `6f36793` scopes CommonJS lint exemptions to
  the required Electron test harness; `452b129` updates the pre-existing logger
  test to use a valid synthetic UUID compatible with the stricter privacy filter;
  `e2b6bcb` formats that test assertion. No unrelated feature or logging
  implementation was added.

## Validation evidence

**Passing GitHub Actions run for code commit `e2b6bcb`:**
[run 41275156655](https://github.com/raisinbran/scrb/actions/runs/41275156655),
completed successfully on **macOS and Windows**.

Both CI jobs completed these steps successfully:

- `npm ci`
- Changed-file Prettier check
- `npm run typecheck`
- `npm run lint`
- `npm run build -w @scrb/summary`
- `npm test`
- `npm run check:boundaries`
- `npm run build`
- `npm run test:smoke`

**macOS:** 886 unit tests passed, 24 skipped (62 test files passed, 2 skipped);
six Electron Playwright smoke tests passed. **Windows:** 847 unit tests
passed, 63 skipped (58 test files passed, 6 skipped); six Electron Playwright
smoke tests passed. Both platforms passed the **real Chromium 2.6 MB HTML-to-PDF**
smoke test, including the script-disabled and cache-cleanup assertions.
Additional unit regressions cover summary busy-state checks, PDF cleanup on
success/failure, and orphan removal on startup.

**CI trigger diagnosis:** PR #8 was behind the new Batch 4 main and had a merge
conflict. GitHub does not run `pull_request` workflows for unmergeable PRs;
runs resumed after the Batch 4 merge. The earlier absence of checks after
`d6febd3` is consistent with that conflict. Subsequent failed runs exposed
real formatting, CJS lint and the old logger-test fixture; the validated run
is green without a branch-specific workflow trigger.

## Exactly what was not run or validated

- **Manual local execution on ChatGPT's host:** no local `npm ci`,
  `npm run check`, `npm run test:smoke`, or compiled Electron launch was run
  there. The equivalent CI commands above ran on hosted macOS/Windows agents.
- **Standalone mutation runner:** `node scripts/prove-cloud-regressions.mjs`
  was **not run** by this batch or by CI; it remains available for manual QA.
- **Skipped unit tests:** macOS skipped 20 transcription import tests and four
  transcription live tests. Windows skipped 63 tests in total, including
  summary worker, transcription import/live, capture source/process-adapter
  and desktop source tests; these were not claimed to pass on Windows.
- **Native and physical validation:** no four-hour/eight-hour recording,
  real call/meeting data, audio-device permission/hotplug, native worker
  or GPU/model benchmark was run in this batch.
- **Release verification:** no signed installer, production model download,
  model-license audit, accessibility screen-reader session or production
  packaging test was run.
- No changes to `packages/contracts/`, no new product features, no merge to
  `main` and no gate approval were performed.

**Review instructions:** Keep PR #8 draft. Claude Code should inspect the
Batch 4 recording merge, the recording-busy race handling, the PDF cache
cleanup boundaries, and the real Chromium smoke test before any owner-approved
merge. The handoff itself is a documentation-only additional commit; use
GitHub's PR checks for that exact final branch head when reviewing.
