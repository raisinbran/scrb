# Cloud tasks fixes QA

**Reviewed:** `af0d189` on `rosmont/cloud-tasks-18-21-25-28-29-33-35-36-20261031`, on macOS. No synthetic or real recordings were used.

**Recommendation: fail for main, conditional for continued work.** C1, C3, C4, C5 and C6 are fixed. C2 is fixed except for E1. The branch itself does not pass `npm run check` or `npm run test:smoke`. No CI has run on any commit after `d6febd3`.

## Fix results

| Finding | Result | Evidence |
| --- | --- | --- |
| C1 | Fixed | Production `printPdf` in real Electron printed 2.6 MB in 5.6 s: valid PDF, no window left. |
| C2 | Partly fixed | Gate is sound and recording stops a running summary, but see E1. |
| C3, C4, C6 | Fixed | Code read. Broken-code proof fails as it should. |
| C5 | Fixed | Scripts off; printing still works. |
| Red-before-green | Pass | `prove-cloud-regressions.mjs`: all seven variants failed their test, source restored. |

## New findings

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| E1 | Medium | A summary for another meeting can start during a recording. `SummaryCoordinator` checks only that meeting's status; imports refuse through `recordingBusy`. | Refuse with `conflict` the same way, with a test. |
| E2 | High | `npm run check` fails: `model-download.ts:59`, `cache` is not in `RequestInit`. | Remove `cache`. |
| E3 | High | `test:smoke` fails: `large-pdf.spec.ts` times out. Destroying the only window quits Electron with no `window-all-closed` listener, and the ES module harness never reached ready with a top-level await on `whenReady`. A listener alone did not fix the spec. | Test only: a CommonJS harness with the listener. Assert scripts did not run. |
| E4 | Low | Nine changed files fail Prettier. | Format them. |
| E5 | Low | `pdf-printer-test-bundle.cjs` is generated and not ignored. | Add to `.gitignore`. |
| E6 | Low | The PR-only CI step names this branch, and must not reach `main`. | Remove it before merge. |
| E7 | Low | A crash during printing leaves the meeting's full text as plain HTML in the OS temp folder, outside the library. | Use the library cache, cleared at startup. |

C7 stays deferred. `model-download.ts` is not wired in, and is unreviewed for release. Its URLs and hashes remain the owner's decision.

## Not run

Windows, real models, real capture, installed app, VoiceOver, Narrator. Printing 40 MB did not finish in 55 s; that is far beyond a real transcript, so it is not a finding.
