# Windows Gate 3: owner decision on Wave 1 evidence substitutions (2026-11-12 PT)

**Status: ACCEPTED by the owner in chat on 2026-11-12. This accepts two evidence substitutions for the Windows Wave 1 playback and capture tests. It does not by itself record Windows Gate 3 as passed and covers no other Gate 3 criterion.**

## What the owner accepted

1. **Loopback substitute for listening.** Playback was verified by a whole-computer loopback recording during playback, matched against the source audio at the expected positions, instead of a person listening. Results carry the label "measured loopback substitute, not listened".
2. **Relaxed Test 4 (run test4e).** The scratch spec required exactly one "Play from" line and seeked with the +15 s button, because the 75 s public AMI excerpt produces one transcript segment. This checks Play, Pause and Resume; it does not meet the original check of at least two "Play from" lines.

## Wave 1 results on BCHEN-W10, as recorded

| Test | Result |
| --- | --- |
| 1 (cancel import) | PASS |
| 2 (failed import cleans up) | Closed by the automated tests run with the real decoder on Windows: `packages/transcription/test/import.test.ts` 19 passed, 1 skipped (video fixture, already marked skipped), 0 failed; `apps/desktop/src/main/imports.test.ts` 17 of 17. The four named cleanup tests passed with `SCRB_REQUIRE_DECODER=1`. The earlier live attempts were inconclusive. |
| 3 | PASS |
| 4 | PASS under the relaxed spec above (test4e): Play at 0.61 s, +15 s to 22.14 s, Pause settled at 30.247 s with near-silent loopback (RMS about 0.3 against about 3,300 playing), Resume played on to 36.34 s; loopback matched the excerpt at r = 0.918 and 0.933 |
| 5 | PASS as a measured loopback substitute |

Evidence: `gate3-wave1-clone-20261111-evidence\wave1-claude-20261112\` (`test4e`, `test2-closure`, `test2-closure-b`) on BCHEN-W10, outside the repository. Nothing was deleted (evidence-retention policy).

## Known follow-ups, not blocking this decision

- A 20 MB public-audio import took more than 5 minutes to create the meeting on BCHEN-W10 (a 75 s excerpt reached ready in 81 to 108 s). Check import time at Gate 3 review.
- CI did not run the real-decoder import tests until PR #104 (macOS only). Windows CI still shows a skip warning; Windows CI decoder support is a separate later decision.
- Mistakes made during these runs are in `agents/agent_self_induced_failures.md` (A-274 to A-290).

## What this decision does NOT cover

- Any other Windows Gate 3 criterion, including the final-pass accuracy and live-latency criteria (latency was accepted separately in `gate-3-windows-latency-owner-decision-record-20261110.md`).
- Any claim that the original two-line playback check or a human listening test passed.
