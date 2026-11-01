# Gate 2 — Evidence and approval review

**Status:** OPEN — independent QA, local native verification and owner approval pending  
**Date:** 2026-11-01  
**Integrated baseline:** `main` at [`e180a51`](https://github.com/raisinbran/scrb/commit/e180a51f5b12cea698766c5c7a764c4c62f09154)  
**Source of requirements:** [Development Plan v2.0](../../dev-plan/Meeting%20Scribe%20-%20Development%20Plan%20(v2.0).md), Gate 2; [checklist](gate-2-checklist.md)

This is a **preliminary ChatGPT evidence review** submitted for independent QA, **not** a declaration that Gate 2 passed. Physical-machine tests below were documented by other agents; no endurance tests were repeated here.

## Gate 2 evidence

| Criterion | Windows | macOS |
| --- | --- | --- |
| T15: 4 h, pause, device change, crash | Oct 30 run covers device changes and crash; Oct 31 built-in-mic rerun counts alongside it by owner decision | Oct 31 run completed with pauses, device change and worker kill |
| Representative load and audio gaps | Built-in mic **1.221 s** missing, meeting **0.331 s** missing; all gaps marked; maximum **281/221 ms**, excluding **18.8 min critical-battery hibernation** explicitly excepted by owner. Original Bluetooth-headset run lost **309.9 s** and did **not** pass the limit | **12.18 s** mic / **8.90 s** meeting missing, all marked; longest meeting gap **5.52 s**, above 5 s threshold but **explicitly accepted** by owner (decision 4) |
| T18: real call, shared audio offset/drift | Whole-computer Teams call: **−3 ms** drift, **118/120** windows, measurement output retained. Teams-followed through real app picker: **−1 ms**, **40/45** windows **reported**; original successful measurement output is **not in the committed evidence file** (see caveat) | 2 h 29 min Teams call: **0 ms** drift over matching windows about minutes 30–140, **owner accepted** despite incomplete windows / different method |
| T17: audio-service restart | Completed; loss marked and recovery documented | Completed Nov 1; recovered after `coreaudiod` restart with **2.29/2.49 s** track gaps and app warning change |
| T6: stopped-stream detection | Completed, according to checklist | Completed with recovery, user warning and marked gaps; post-T20 retest passed |
| T20: permission/privacy at stream reopen | Marked done in checklist; cross-platform `permissionLost` UI change is unit tested on Windows | Nov 1 fix and physical reopen retest completed; silence detected, warned and missing spans marked on both tracks |

**Underlying evidence:** [Windows capture results](../../native/windows-capture/README.md), [Windows built-in mic run notes](../../native/windows-capture/results/long-run-builtin-notes.txt), [Windows whole-computer T18 measurement](../../native/windows-capture/results/t18-whole-offset.txt), [Windows Teams-picker T18 file](../../native/windows-capture/results/t18-picker.txt), [Mac test report](../handoffs/2026-10-30-macos-long-run.md), and the [Gate 2 owner decisions](gate-2-checklist.md).

**T18 provenance caveat:** The Windows Teams-picker result is described as 40/45 windows and −1 ms in the checklist and capture README, but `native/windows-capture/results/t18-picker.txt` contains `MODULE_NOT_FOUND` for `call_offset.mjs`, not a successful drift computation. The failed command output is preserved unchanged. GitHub material reviewed here does not independently substantiate the reported picker-path number. Recover successful measurement output from the Windows PC if available, otherwise obtain an explicit owner disposition; **do not manufacture output or repeat the call without need**. The separate whole-computer measurement is genuine evidence but does not establish drift on the followed-Teams path.

**Owner-accepted exceptions:** The Windows battery hibernation remains included in the original printed `LIMITS FAILED` report (**1130.730 s** mic missing with sleep); excluding that one event yields the accepted 1.221 s mic loss. The Mac **5.52 s** under-load gap also remains documented as exceeding the 5 s limit, with the owner's explicit no-rerun acceptance. Do not relabel either raw test report as an unconditional pass.

## Final verification

- **Verified cloud CI:** [`main` run 41293637940](https://github.com/raisinbran/scrb/actions/runs/41293637940) — **PASS on macOS and Windows**. Each OS completed typecheck, lint, summary build, unit tests, boundary checks, application build and `npm run test:smoke`. The workflow runs the constituent `npm run check` steps separately, not the combined command.
- **Verified PR CI:** [draft PR #12 run 41294999297](https://github.com/raisinbran/scrb/actions/runs/41294999297) — **PASS on both platforms**; PR is documentation-only.
- **Not verified by CI:** native Swift/macOS and C++/Windows capture helper builds on the final integrated baseline, and any hardware-dependent short smoke checks not already demonstrated on that baseline. Assign these checks to a local agent; report actual results before approval. No new 4 h or 8 h test is required.

## Remaining approval actions

1. **Codex / local machines:** verify final-baseline native helper builds and relevant short smoke checks on Windows and macOS; document command, platform, commit SHA and PASS/FAIL.
2. **ChatGPT + Codex if local files are needed:** reconcile the missing raw Windows Teams-picker T18 measurement output, or clearly document an owner-approved evidence exception.
3. **Independent Claude Code QA:** review this preliminary document and the actual evidence, particularly privacy/recording behavior, owner exceptions and final native results; identify only material defects.
4. **Owner:** approve Gate 2 explicitly after reviewing the above; merge only after independent QA and approval. The gate remains **OPEN** until then.

**Deferred, not Gate 2 blockers:** Mac USB microphone real-speech test at 44.1 kHz (Phase 8), full T19, 8-hour endurance, Zoom/browser target coverage and physical output-device unplug checks.
