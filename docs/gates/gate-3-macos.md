# Gate 3 — macOS approval record

**Status:** macOS Gate 3 **approved by the owner on 2026-11-02**. Windows Gate 3 is **open** and needs its own owner decision.
**Tested runtime commit:** [`e85eefed98298221cf921ba62f9b2e3e325a54bd`](https://github.com/raisinbran/scrb/commit/e85eefed98298221cf921ba62f9b2e3e325a54bd), the head of [PR #42](https://github.com/raisinbran/scrb/pull/42). PR #42 is not merged by this record.
**Source of requirements:** [Development Plan v2.0](<../../dev-plan/Meeting%20Scribe%20-%20Development%20Plan%20(v2.0).md>), Gate 3; [platform split](gate-3-platform-split-20261102.md)

Raw evidence, including public-audio recordings, stays on the owner's Mac under
`~/Documents/ChatGPT/srcb/` and is not in Git. All test audio was public AMI meeting audio or invented speech.

## Accepted physical evidence (original test execution by Codex on the Mac)

| Criterion                                               | Commit    | Result                                                                                                                                                                                                    | Local evidence folder                                 |
| ------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Live delay, both tracks busy                            | `e85eefe` | run1: mic median 0.99 s, p95 1.43 s; meeting 0.94 s, 1.55 s. run3: mic 1.06 s, 1.71 s; meeting 1.16 s, 1.78 s. 100% within 6 s in both. Measured from native audio segment end to first word in the page. | `mac-gate3-final-evidence-20261102`                   |
| Live delay, window covered for 59 s                     | `e85eefe` | Every covered segment drawn before uncovering; outside the cover, mic 1.12/1.93 s and meeting 1.07/1.81 s median/p95.                                                                                     | `mac-gate3-occlusion-evidence-20261102`               |
| Final pass at least 15% fewer word errors than live     | `689c3d4` | 184 to 141 errors, 23.4% fewer, three clips. One clip worsened (79 to 93).                                                                                                                                | `mac-gate3-evidence-20261102`                         |
| Worker kill during audible capture                      | `689c3d4` | 4 saved hashes unchanged, helper kept running, no missing-audio gaps, status `ready`.                                                                                                                     | `mac-gate3-evidence-20261102`                         |
| Import of each format; cancel and failure leave nothing | `689c3d4` | 7 of 7 formats `ready`; cancelled and failed imports added 0 meetings and left 0 staging entries.                                                                                                         | `mac-gate3-evidence-20261102`                         |
| Memory                                                  | `fb2d96c` | 937 MiB peak across app processes in a 10-minute Teams call.                                                                                                                                              | `~/.local/share/scrb-tests/teams-field-20261102-mac/` |

`689c3d4` and `e85eefe` have identical files (`git diff` is empty), so those checks apply to the tested commit.
Run2 at `e85eefe` also passed but is supplementary: the window lost focus in 138 of 269 samples.

## Independent review (separate from test execution)

A separate Claude session reviewed the evidence and code without rerunning tests. Verdict: **CONDITIONAL PASS**,
the condition being that the display stall below is explained or recorded as a risk. It checked:

- Clock calibration: drift 0.26 ms (run1) and 0.22 ms (run3), and no negative delays.
- Matching: segments are matched by word ID; all 108 (run1) and 131 (run3) segments reached the final transcript and the page.
- Commit equivalence of `689c3d4` and `e85eefe`.
- False-pass risk: run1 and run3 kept the window always on top. The covered-window run was requested to test that case.

This is repository and evidence review, not independent physical execution.

## Open risk accepted with the approval

**About 20 seconds of transcript display stall, seen once, cause unknown.** In the first delay run
(`689c3d4`, `mac-gate3-evidence-20261102`), no new lines appeared on screen from about 2:22 to 2:44, then all
arrived at once. Backend events arrived on time and no text was lost. It did not recur in six later runs on the
same code, including the covered-window run. That run does not rule out a hidden or minimized window: the page
stayed `visible` while covered. No cause has been established and no fix has been made.

If it recurs, keep the per-second scroll, row and visibility logging on so the cause can be found.

## Not covered by this approval

- Windows Gate 3, which is open and awaits its own owner decision.
- A minimized window or one on another desktop.
- Delay with the app behind a meeting app in a real call.
- If a Windows fix changes shared live code, the affected Mac checks are rerun.
