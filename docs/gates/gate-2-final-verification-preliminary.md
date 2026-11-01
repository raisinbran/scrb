# Gate 2 final verification — preliminary evidence review

**Date:** 2026-11-01  
**Baseline:** `main` at `e180a51f5b12cea698766c5c7a764c4c62f09154`  
**Disposition:** PENDING. This is ChatGPT's preliminary cloud-accessible evidence review, **not** independent QA or Gate 2 approval. No endurance tests were repeated.

## Platform evidence (previously run on physical machines; not executed in this review)

| Requirement | Windows | macOS |
| --- | --- | --- |
| T15 four-hour run | Completed 2026-10-30; subsequent built-in-mic load run 2026-10-31 | Completed 2026-10-31 |
| Load loss | Built-in mic **1.221 s** and meeting **0.331 s** outside an owner-excepted critical-battery hibernation; longest gaps 280.8/220.6 ms; report itself says LIMITS FAILED (including 1130.730 s mic gap) | **12.2 s / 8.9 s** loss, every gap marked; owner accepted a **5.5 s** stall (decision 4) |
| T18 real call | Teams from real picker, 22 min, drift **−1 ms**, 40/45 measured windows | 2 h 29 min, accepted as **0 ms drift** (decision 1) |
| T17 audio-service restart | Marked done in Gate 2 checklist | Marked done 2026-11-01 |
| T6 stopped stream | Marked done | Marked done 2026-10-31 |
| T20 permission/privacy on reopen | Marked done | Marked done 2026-11-01 after fix |

**Sources:** `docs/gates/gate-2-checklist.md`; `native/windows-capture/results/long-run-builtin-notes.txt`; `native/windows-capture/results/t18-picker.txt`; prior merged PR #10. These numbers are recorded machine results, **not** independently rerun. The Windows hibernation exception is explicit, not a retroactive test pass. The 19-second timeline discrepancy noted in Windows hibernation evidence remains unexplained; do not treat that interval as a measured normal-run drift pass.

## Final CI and native check status

- GitHub Actions workflow `.github/workflows/ci.yml` defines `macos-latest` and `windows-latest` matrix jobs: typecheck, lint, summary build, unit tests, boundaries, build and smoke tests.
- **CI conclusion for latest `main` not verified.** GitHub commit status lookup returned no statuses and the available workflow-run lookup returned no PR-triggered runs for `e180a51`, `6832696`, or `aa88eb4`. The lookup does not establish success/failure for push-triggered runs. Do not claim CI passed.
- `npm run check`, `npm run test:smoke`, and native builds **after the latest capture change on the integrated main baseline** remain unchecked in the Gate 2 checklist.
- PR #10 previously reports Windows `npm run check` (804 pass / 63 skip), smoke (5 pass / 2 skip), native build and regressions on its merged branch; that is not proof of final cross-platform checks after later Mac T20 capture changes.
- **Codex/local platform owner:** verify current-baseline Windows and Mac native builds and existing short hardware-dependent regression/smoke checks only if not already verified for the exact capture code. Do not repeat four-hour endurance runs.
- **ChatGPT/cloud owner:** obtain a verifiable GitHub Actions run/job conclusion for both OS jobs on the final baseline; examine failures, only propose narrowly scoped fixes on a `rosmont/` branch, and require independent QA before merging.

## Gate 2 status / handoff

**Gate stays open** pending recorded final CI/native check evidence, independent QA of any ChatGPT edits, and owner review of `gate-2.md`. No nontrivial recording/privacy defect was independently verified in this documentation review; escalate such defects to Claude Code if found. Do not expand this closeout into later-phase T19, 8-hour tests, Zoom/browser/second-device work or Mac USB 44.1 kHz testing (deferred before Gate 8).

This report is itself a preliminary documentation-only ChatGPT change and must be independently QA-reviewed before merging.
