# Windows Gate 3: owner decision record for the live-latency criterion (2026-11-10 PT)

**Status: SIGNED by the owner in chat on 2026-11-10 (commit dcf4333). This is an owner risk-acceptance decision for the Windows live-latency criterion only. It is not a measured protocol pass.** It changes no threshold, pinned file, manifest, plan or earlier result.

## 1. Decision requested

The owner is asked to accept the Windows live-latency criterion (median 3 s or less and at least 95% of units within 6 s, per track) as sufficiently evidenced by scored-run-2, knowing the risks in section 4. This would be an **owner decision, not a measured protocol pass.** The protocol says one run cannot clear Gate 3 by itself and that no combination of results may be called "FIXED". The frozen result of 2026-11-07 (73 of 77 = 94.8%, original detector-end rule) is not reversed or re-scored: this run measures a different endpoint (word end to visible text).

## 2. Evidence (scored-run-2; details in `docs/handoffs/2026-11-10-gate3-windows-scored-run-2-result.md`)

| Item | Meeting track | Microphone track |
| --- | --- | --- |
| Layer A, latency | PASS: 75 of 75 within 6 s, median 1.547 s (conservative) | PASS: 62 of 65 = 95.4%, median 1.544 s; both bounds agree |
| Layer B, 170 to 245 s | NOT OBSERVED (19 units, all matched) | FAILURE OBSERVED: one unit at 185.83 s was not matched. Heuristic class c: a row appeared 2.47 s after the word with a different word; the neighbouring units were on time |
| Other uncredited units | none | One unit at 292.8 s, outside the window (heuristic class a: the tail never appeared); one CAPTURE-LIMITED unit next to the chunk-47 event |
| Layer C | Inconclusive: the tool does not implement it | Same |
| Pin used | manifest `a41e289b...` / code `76768d5` | manifest `b0a00b68...` / code `78c9acb` |

The meeting-track result is identical under both pins (subtree hash `adc8c93013990d32875b64e919cbe2321f5af214efbab0e0c2fea281f682cd76`). The worst conservative latency of any microphone unit at or after chunk 47 is 4.566 s. The owner has accepted D1 (mechanical eligibility, all 140 units eligible) and D2 (12-clip spot-check as sensitivity evidence only).

## 3. What this decision does NOT cover

- Any other Gate 3 criterion or any other gate.
- Any claim that the live path is fixed.
- The root cause of the 2026-11-07 misses (not diagnosed).

## 4. Residual risks (plain words)

- **Thin microphone margin.** Likely to matter: 3 of 65 units were uncredited, and a fourth would have dropped it below 95%.
- **Single run.** Serious but expected: one result cannot show the rate is stable.
- **Same window as November 7.** One microphone unit at 185.83 s was UNIDENTIFIED, producing Layer B FAILURE OBSERVED. The classifier heuristically identified a recognition difference (class c), but this does not establish that the original failure pattern was absent or explain why the correct word was not credited.
- **One unit's tail never appeared** (292.8 s). Cause unknown; one of 65, but it is a missing-output case.
- **Rule change after seeing data.** The chunk-47 allowance was added after run 2; it can only make results slightly worse (at most 13.5 ms), so low risk to the result, but an outside reader may weigh it.
- **Unexplained capture event** about 106 s into microphone recordings (two chunks, practice and scored, each with extra samples). Uninvestigated; medium concern, and a CAPTURE-LIMITED unit sits next to it.
- **Hyphenated words.** The matcher and the classifier stop on them; a documented filter was used. Low risk to this result; the tools need fixing.
- **Post-run evidence handling.** Scorer-format eligibility and frozen flags were established after recording, and scoring used hashed evidence-folder helpers outside the manifest. The owner's D1/D2 decisions accept the stated approach but do not make those inputs pre-capture frozen evidence.
- **Level meters read 0 during capture.** The log reports zero for both tracks. Audio chunks exist and meeting-track alignment passed, but the cause of the zero readings was not investigated. A display-only issue is unproven.
- **One machine, one recording.** Other hardware may behave differently.

## 5. Monitoring and reopen conditions (owner may edit)

- PR #67 diagnostics are draft, open and unmerged; they are not currently available in the product. Investigating any reopen condition would first require those diagnostics to be integrated and available.
- Reopen the criterion if field use or later tests show late or missing output around 3 minutes into a session, or if a later scored run falls below 95% on either track.
- Open a separate low-priority task to investigate the 106 s capture event.

## 6. Owner decision (signed in chat on 2026-11-10, commit dcf4333)

2026-11-10: heading corrected after signing; no other change.

- [x] Accept risk and mark the Windows live-latency criterion accepted: owner decision, recorded from the owner's chat message
- [ ] Do not accept: ______________________

Name: Brandon C (git config user.name; owner chat approval)    Date and time (PT): 2026-11-10 18:03

> OWNER DECISION (verbatim): I, the owner, have read docs/gates/gate-3-windows-latency-owner-decision-record-20261110.md at commit 4c08d05. I accept the risks it lists and accept the Windows live-latency criterion (median 3 s or less, 95% within 6 s, per track) as sufficiently evidenced by scored-run-2, as an OWNER DECISION and not as a measured protocol pass. This does not reverse or re-score the 2026-11-07 result, covers no other Gate 3 criterion, and does not mean the live path is fixed. The reopen conditions in the record apply.

## 7. Independent review

ChatGPT binary review: REJECT on four wording edits (overstated interpretation of the 185.83 s unit, unsupported level-meter diagnosis, diagnostics availability, undisclosed post-run evidence handling); all four applied at 4c08d05; no second ChatGPT round; the owner reviewed the revised text before signing.
