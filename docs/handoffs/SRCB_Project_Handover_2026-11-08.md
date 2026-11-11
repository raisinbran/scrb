# SRCB / Meeting Scribe — Project Handover

**As of:** Sunday, 2026-11-08, approximately 09:35 America/Los_Angeles (PST)  
**Repository:** https://github.com/raisinbran/scrb  
**Purpose:** Transfer the project's architecture, approved decisions, live branch/PR state, Windows Gate 3 acceptance, and macOS Phase 4/5 work without confusing code completion, CI, independent review, merge, and gate approval.  
**Evidence basis:** GitHub repository, PR discussions, and Actions inspected on 2026-11-08; owner/agent decisions recorded in the project conversations through 2026-11-08. Some private physical-test evidence was reported but was not independently reopened for this handover.

> **Immediate status:** Gates 0–2 are owner-approved. macOS Gate 3 is **approved**. Windows Gate 3 is **not approved**. macOS Phase 4/5 development has meaningful integrated work, but **neither Gate 4 nor Gate 5 is approved**. PR #42 remains an unmerged draft integration candidate. PRs #58, #64 and #67 remain separate, unmerged drafts.

## 1. Project at a glance

SRCB (also called **Meeting Scribe**) is a personal-use, local-first Electron desktop recorder for **Windows and macOS**. It records the microphone and meeting/system audio as separate synchronized tracks, displays live transcription, runs an accuracy-oriented final pass, supports imported audio and click-to-play, and is building persistent speakers, voice profiles, correction/vocabulary, summary and export workflows.

**Owner decisions that remain in force:** local processing by default; live plus final transcription; recognize previously heard voices from V1; retain source audio until explicitly deleted (subject to approved retention controls); do not distribute publicly at present. Preserve private recordings, transcripts and voiceprints outside Git. Runtime audio integrity must not depend on the AI workers or UI.

Architecture: Electron main/preload + React UI; `@scrb/contracts` is the approved UI/backend boundary; separate native capture and transcription workers; Whisper-family speech inference; Sherpa speaker embeddings; Opus chunks and meeting folders as durable source of truth; SQLite for indexes/profiles. Final transcript user edits are layered rather than overwriting original recognition. A summary becomes potentially outdated after transcript/speaker changes.

### Gate / phase status

| Area | Status | Evidence / qualification |
| --- | --- | --- |
| Gates 0–2 | **Approved** | Gate 2 owner approval on 2026-11-01; preserved capture, device/recovery and long-run evidence. Mac USB mic 44.1 kHz deferred to Phase 8; full 8-hour T19 moved before Gate 8. |
| macOS Gate 3 | **Owner-approved** | Tested runtime `e85eefe`; documented in [macOS Gate 3 record](https://github.com/raisinbran/scrb/blob/2d1f8150cb68d56ec3fc842f1709f276f124ef55/docs/gates/gate-3-macos.md). A single unexplained ~20-second UI stall was accepted as a tracked risk. |
| Windows Gate 3 | **NOT APPROVED** | Many subchecks passed, but two-busy-track live responsiveness/coverage, additional targeted evidence, throughput/endurance and final acceptance remain open. See §3. |
| macOS Phase 4 — speakers | **In progress; Gate 4 not approved** | Real routing and atomic speaker split integrated into PR #42; voice-profile recognition PR #58 pending. Profile learning, real Speakers UI, speaker accuracy/wrong-match acceptance remain unfinished. |
| macOS Phase 5 — corrections/vocabulary | **Partially implemented; Gate 5 not approved** | Persistent correction/Undo foundations and some UI exist, but full real UI + 100%-survival and vocabulary quality evidence are not complete. |
| Phase 8 accessibility | **Early parallel work only** | Focus and 200% zoom PR #64 is green but held for owner-required UI-specific review and native checks. Not a Gate 3 blocker. |

## 2. Current repository and PR topology

**GitHub `main`:** `86461139890769f68dfe5c65ea2a2239bb2b5a39` — merge of the Codex usage-policy [PR #66](https://github.com/raisinbran/scrb/pull/66) on November 7 PT. `main` does **not** include the Gate 3 / Phase 4–5 candidate branch.

**Integration stack (do not mistake nested merges for merges to `main`):**

```text
main (864611398)
  ... separate older preparatory / Gate 3 branches ...
  PR #40, recording preemption (d4a4922) [draft]
    PR #42, integrated Gate 3 candidate (2d1f815) [draft, open]
      PR #48, real meeting routing/import reminder [MERGED INTO #42]
        PR #50, atomic persistent speaker split [MERGED INTO #48]
      PR #58, verified existing voice-profile recognition (111cb1e) [draft, open]
      PR #64, focus fallback / 200% zoom port (6cfd0d3) [draft, open]
      PR #67, opt-in live-stage tracing (1905e729) [draft, open]
```

| PR | Current state | Important detail |
| --- | --- | --- |
| [#42](https://github.com/raisinbran/scrb/pull/42) | Draft, open, head `2d1f815` | Integrated recording/import/playback/live and the merged #48/#50 changes; **47 files / ~3,975 additions** relative to its stacked base, not merged into main. Final-head [CI #42176646918](https://github.com/raisinbran/scrb/actions/runs/42176646918) **PASS after Windows job rerun (attempt 2)**. PR description contains outdated older-head/blocker text—check live head and newer evidence. |
| [#48](https://github.com/raisinbran/scrb/pull/48) | **Merged into #42**, merge `2d1f815` | Real meeting action routing, forwarded events and import voice-profile reminder. Original seven-file slice had independent scoped QA (77/77, ten intended mutation failures, restored passing), Windows/macOS CI. |
| [#50](https://github.com/raisinbran/scrb/pull/50) | **Merged into #48**, merge `1afc4e0` | One-revision speaker split + one Undo entry; guarded against overlapping unselected words. Head `6cf0939` underwent separate source review and Windows/macOS CI. |
| [#58](https://github.com/raisinbran/scrb/pull/58) | Draft, open, head `111cb1e` | P4-A profile recognition and post-commit notifications. Mac CI passes, **Windows CI fails**; native Mac verification not run. See §4. |
| [#64](https://github.com/raisinbran/scrb/pull/64) | Draft, open, head `6cfd0d3` | Port of focus/zoom behavior; both-platform CI passes, but explicit owner hold for Claude Code UI review and checks. See §4. |
| [#67](https://github.com/raisinbran/scrb/pull/67) | Draft, open, head `1905e729` | Diagnostic-only opt-in worker/supervisor tracing; current head CI passes, **one analyzer correction still required** before approval. See §3. |
| [#66](https://github.com/raisinbran/scrb/pull/66) | **Merged into main** | Codex weekly-allowance policy and progress checkpoint. Propagation to PR #42 branch is separate work, not yet established. |
| [#53](https://github.com/raisinbran/scrb/pull/53), [#54](https://github.com/raisinbran/scrb/pull/54) | Draft evidence PRs | Windows final-pass recovery and AMI launch/accuracy evidence; preserve rather than regenerate. |

**CI caution:** The latest `main` [run #42448516572](https://github.com/raisinbran/scrb/actions/runs/42448516572) after PR #66 failed **Windows only**: two unchanged storage tests hit 5-second timeouts with SQLite `EBUSY` cleanup errors; macOS passed. A related failure family appears in PR #58 and PR #64 intermediate runs. Root cause is **not established**; do not infer that the Markdown-only #66 caused it or blindly increase test timeouts.

## 3. Windows Gate 3 — acceptance and diagnostics

### 3.1 What has already been established

- **Final transcription on preserved real recording:** A roughly 60-minute Teams recording was safely recovered from a verified working copy and reached `ready`, with **7,360 microphone / 7,607 meeting** final words and no invalid timestamps. CPU launch-to-ready was **76 min 17.501 sec**, proving completion but **not** the representative GPU-capable final-pass speed target. Evidence: [PR #53](https://github.com/raisinbran/scrb/pull/53), [PR #42 closeout triage](https://github.com/raisinbran/scrb/pull/42#issuecomment-6624082261).
- **Reference-based accuracy:** A physical Windows public AMI ES2002a test (2:00–9:00 source, **826 reference words**) yielded live **47.82% WER (395/826)** and final **24.58% WER (203/826)**, a **48.61% relative reduction**. This exceeds the **15%** numerical target for that sample. The source alignment/completeness check is separate from the local scorer's generic inconclusive flag; it does not approve the whole gate. Evidence: [PR #54](https://github.com/raisinbran/scrb/pull/54), [PR #42 comment](https://github.com/raisinbran/scrb/pull/42#issuecomment-6624082261).
- **Import formats:** Existing Windows evidence reports **21/21 successful imports across seven supported formats** on an ancestor with matching importer code. Do not repeat all formats simply to increase counts. Missing cancel/fail cleanup, real picker and playback acceptance should first be audited against preserved evidence.
- **UI responsiveness vs capture activation:** Record's visible “Starting” acknowledgment was roughly **23–41 ms**, Stop UI about **12.7 ms**; physical capture activation was longer (~0.8–1.2 s). The **200 ms requirement concerns UI response**, not the time until capture becomes active. Pause under load remains a specific evidence question.
- **Mac is independent:** Mac Gate 3 is already approved. Windows-specific work does not reverse that approval; rerun affected Mac checks only when shared code changes materially warrant it.
- **Muffled microphone interval:** A past ~165-second microphone-publication gap was listened to by the owner and classified as degraded/unintelligible input, **not a demonstrated transcription defect and not a passing sustained-microphone test**. Do not reopen without new evidence.

### 3.2 What remains unresolved

1. **True simultaneous busy tracks:** On Windows, independently intelligible mic speech **and** meeting/system speech must be active while calibrated live output is measured. Gate target: median **≤3 s** and p95 **≤6 s** per track; capture integrity and backlog/lost-frame classification required. Earlier old-build two-busy median **12.59 s** was a failure lead; newer meeting-dominant clips do not prove the two-busy criterion.
2. **Unattributed/late speech in prior evaluation:** The frozen analysis was **73/77 FAIL under detector-end** and **74/77 NOT PROVEN under the acoustic-end bound**; these are **not passes**. Newly discovered cases such as `meeting-40-114530` and `meeting-41-115360` must be tracked as later investigative leads, not silently folded into frozen denominators. Batches containing earlier, pre-speech words cannot be credited to later speech units.
3. **Remaining targeted evidence:** Audit saved worker-kill/recovery, real picker/click-to-play, import cancel/failure cleanup, loaded UI Pause acknowledgment and representative final-pass speed before commissioning new tests. There is no permission to erase or repeat preserved private recordings.
4. **Four-hour endurance:** Verify candidate-equivalence and existing preserved Windows evidence before deciding whether one instrumented four-hour live run is truly missing. If needed, run it **only after short checks pass and explicit owner authorization**; no back-to-back four-hour retries.
5. **Independent acceptance evaluation and owner decision:** No Windows Gate 3 waiver or approval has been granted.

### 3.3 PR #67: upstream diagnostics (“PR A”)

[PR #67](https://github.com/raisinbran/scrb/pull/67), head `1905e729`, adds **disabled-by-default**, metadata-only worker and supervisor JSONL traces for frame receipt/queue, VAD, model inference, segment emission, supervisor receipt and delivery. It does not change recognition policy or repair live transcription. No PCM, words, transcripts, speaker IDs, arbitrary paths/errors or secrets should enter trace records. Files live in an explicitly configured private directory, outside ephemeral scratch; writer is bounded/nonblocking relative to the capture path. The analyzer reports UNKNOWN for incomplete evidence. [Implementation handoff](https://github.com/raisinbran/scrb/blob/1905e729d329d2865929726f635890c5acdb0746/docs/handoffs/gate3-upstream-diagnostics-pr-a.md).

**Verified:** [Windows/macOS CI #42448979069](https://github.com/raisinbran/scrb/actions/runs/42448979069) PASS; initial independent review's completely missing-worker-file issue was corrected. **Still blocking PR approval:** independent targeted review found a complete-looking supervisor/worker pair with **zero processing-stage observations** can produce `unknown:false`. Fix the **analyzer and regression only** so “no analyzable processing” is UNKNOWN/INCONCLUSIVE without alleging a cause; run focused checks plus both-platform CI on the new head, then obtain independent confirmation and owner merge authorization. No physical test or PR B is authorized by PR A review.

**PR B** (sink/persistence/publication tracing) is **not implemented** and must not be started merely because PR A exists. Justify it only if PR A observations establish delivered segments without downstream output or another concrete missing boundary.

### 3.4 Windows follow-up retest protocol — review closed, execution NOT authorized

The owner **closed and accepted protocol v3 as a design baseline on November 8**, independently of PR #67's remaining code fix. This did **not** authorize recording, a 30-minute run, a merge, or Gate 3 approval.

Critical rules preserved from the final protocol review:

- Prefer prerecorded, independently word-timed mic and meeting/system sources, **not owner narration**. Approximately **420 s total recording / 360 s scored**, with **at least five scored minutes** including the disputed **203–214 s** interval.
- Separate detector-end and acoustic-end acceptance bounds, including speech straddling timing boundaries; report both rather than changing a denominator to claim a pass.
- A publication of **PRE-SPEECH** words never receives credit for later speech. **UNIDENTIFIED** means output identity/publication coverage is insufficient to match the target unit, **not proof of recognition-stage failure**. Neither receives credit in either bound without independent evidence.
- Compute per-stage intervals and counterfactual localization **only when an unambiguous, chronologically consistent event chain exists**. Otherwise preserve observed stage outcomes and mark per-unit localization **INCONCLUSIVE**. Cross-process time anchors are uncertain.
- An incomplete/absent trace, missing footer, dropped/partial records or unobservable stage must not become a false negative or a guessed root cause. Keep the original frozen results separate from post-hoc cases.

**Before execution:** (a) fix PR #67 analyzer edge and achieve final-head green Windows/macOS CI; (b) independent confirmation and owner review/authorization to merge, if merging is chosen; (c) verify real Live-screen observer and capture path, not just fake-model tracing; (d) resolve all protocol `[CONFIRM]` preflight items; (e) freeze hashed source/manifest and acceptance rules; (f) obtain **specific owner approval for the planned up-to-30-minute test** (tests expected to exceed 20 minutes require advance permission). Retain sanitized result summary in Git and raw evidence privately. Do **not** execute on the basis of protocol approval alone.

## 4. macOS Phase 4/5 — status and pending QA

The owner explicitly allowed **Mac Phase 4/5 development to proceed in parallel** while Windows Gate 3 remains unresolved; it is **not** a blanket authorization to approve Gates 4/5 or merge stacks into `main`.

### 4.1 Integrated foundation

- **PR #48 is merged into PR #42:** real meeting-scoped actions (including speaker operations, metadata/summary/export), event forwarding and import privacy reminder routing; mock-only profile/vocabulary capabilities remain distinct. Scoped baseline and ten mutation reversions passed. This is implementation evidence, **not Gate 4/5 approval**.
- **PR #50 is merged via #48 into PR #42:** speaker splitting creates a new meeting-level speaker and timestamp override in one persisted transcript revision and **one Undo entry**; restart/Undo/Redo/stale revision scenarios covered. The P2 overlap fix rejects any range that would reassign unselected same-track words or miss selected words. It is intentionally conservative. **Known follow-up:** UI requests do not carry the exact revision seen when selection was made, so a changed-but-still-valid selection may be accepted against newer state; track separately, do not reopen #50's corrected scope without evidence.
- Older [PR #35](https://github.com/raisinbran/scrb/pull/35) is **mock-based early speaker/Undo/editor UI work**, still draft and not real app acceptance. Avoid wholesale cherry-picks from the obsolete mock stack; port narrowly against current candidate if justified.

### 4.2 PR #58: P4-A recognize existing named voice profiles

[PR #58](https://github.com/raisinbran/scrb/pull/58), draft head `111cb1e`, base PR #42 at `2d1f815`. A completed recorded/imported final pass can match **existing** compatible voice profiles, with fingerprinted embedding model (`eres2net`, approved SHA-256), **0.60** automatic confidence threshold and **minimum eight samples** per stored profile. It uses a single atomic transcript assignment batch and Undo entry, respects manual naming/identity and stale revisions, keeps profile SQLite data read-only, and does not compromise core completion if optional matching fails. Later targeted correction ensured actual committed before/after edit notifications are published after successful core completion. **No profile learning, new shared contracts, suggestions or real Speakers UI in this PR.**

**CI:** macOS **PASS**; Windows **FAIL** at final head [run #42278482805, attempt 2](https://github.com/raisinbran/scrb/actions/runs/42278482805). Four **unchanged storage tests** (format validation, index migration and two library crash/correction cases) timed out at 5 s with SQLite `EBUSY` cleanup. An earlier attempt failed different import-boundary cases. The overlapping CI signature does **not** establish a root cause or prove unrelatedness. New profile-notification tests passed. **No automatic third broad rerun or speculative timeout increase.**

**Native Mac verification has NOT run** at this final head because both-platform CI was not green. Prepped real-Electron/public AMI fixtures and models are not a substitute for executed evidence. Blockers: targeted Windows CI diagnosis; green final-head jobs; physical native import/recorded open-transcript/profile assignment and Undo/restart check with real embeddings; independent review after validation; owner merge decision. P4-A alone cannot achieve Gate 4.

### 4.3 P4-B and P4-C (not implemented)

- **P4-B — verified-fingerprint profile learning/persistence:** create/grow reusable profiles only when provenance is verified, while preventing duplicate growth/crash-window partial writes across transcript files and SQLite; enforce consent and import opt-in. Earlier proposed plan received targeted QA feedback and needs a reviewed, owner-approved implementation slice. Do not start a costly implementation simply because P4-A exists.
- **P4-C — profile suggestions / real Speakers screen:** surface low-confidence suggestions without automatic wrong matches, wire real profile rename/merge/delete/split and Undo/Redo. Mock UI is not evidence of functional real UI. Schedule after P4-A verification and appropriate P4-B design, without expanding Windows Gate 3.

### 4.4 PR #64: macOS focus/200% zoom port (early Phase 8)

[PR #64](https://github.com/raisinbran/scrb/pull/64), draft head `6cfd0d3`, is a focused port of PR #36's heading fallback and layout wrapping onto PR #42. [Final-head macOS/Windows CI #42331216488](https://github.com/raisinbran/scrb/actions/runs/42331216488) PASS; preliminary independent ChatGPT code QA found no blocking code defect. Scope is ten UI/test files; tests include keyboard and 200% zoom/overflow, with original native Mac evidence using invented/mock data. **Not merged.**

**Owner hold:** Claude Code UI-specific review and hands-on QA remain required; Claude Code was unavailable at last report and no alternate reviewer was authorized. Use the **revised** `SRCB_PR64_Review_Handoff_2026-11-06(1).md`, not its superseded version. Tasks include reproducing (before changing) focus/scroll movement on Meeting Detail and another `useFocusFallback()` screen; the separate **60-second Live mouse-selection/scroll survival** check; real 200% Mac visual layout and keyboard reachability of Start/Pause/Stop without auto-scrolling; only make demonstrated fixes, then run focused tests, final-head CI and independent correction review. This remains Phase 8 and is **not** a Gate 3 acceptance condition. [Owner QA hold comment](https://github.com/raisinbran/scrb/pull/64#issuecomment-6703607076).

### 4.5 Gate 4/5 acceptance not yet established

**Gate 4 (speakers):** final speaker diarization accuracy around **DER ≤25%** on AMI evaluation; wrong automatic voice-name match **<2%**; confidence-gated suggestions; every assignment reversible; real speaker management; privacy reminder per applicable new recording; imported audio must not modify a profile without the user's per-file opt-in. P4-A only recognizes verified existing profiles and has not yet completed native QA. **No owner Gate 4 pass.**

**Gate 5 (corrections/vocabulary):** **100%** user corrections preserved across restarts **and final passes**, with frozen corrected spans; real editing/Undo/Redo and vocabulary hint integration; demonstrated improved recognition without exceeding **one false replacement per hour**. Foundations exist but full physical/end-to-end and vocabulary acceptance evidence is not complete. **No owner Gate 5 pass.**

## 5. Engineering practices and owner boundaries

1. **Review order:** automated checks/style/tests/CI complete → independent review by an agent other than the author → address justified findings and rerun affected checks → owner approval → merge. A GitHub COMMENTED submission or AI review cannot impersonate formal independent GitHub identity. Plans/recommendations in planning roles also need at least one outside review before owner approval (Claude chat is default when available).
2. **Keep CRs reviewable:** roughly 500–700 changed lines is a comfortable human range, ~1,000 often workable with AI, ~1,500 needs extra discipline, 2–3k is a practical upper bound, and >3k is exceptional. Complexity and data-safety risk matter more than raw counts. Split large coherent features into stacked PRs and review each slice; do not repeat exhaustive review of the aggregate. Avoid verbose/redundant GitHub comments and unnecessary administrative micro-PRs.
3. **Branch policy:** use `rosmont/*`, never push directly to `main`; respect PR stacking, existing file ownership, approved contracts/IPC/security boundaries and explicit owner merge permissions. For risky recording/storage/recovery/security/API changes, owner-approved short plan first.
4. **Preserve evidence and privacy:** never commit or disclose real owner meeting audio/transcripts/voiceprints, secrets or identifying logs. Keep gate raw evidence privately until the relevant gate passes **and** owner authorizes cleanup, including traces outside ordinary rotating application logs.
5. **Tests and budgets:** targeted diagnosis before broad runs; never repeatedly launch four-hour tests. Any test expected to exceed **20 minutes total** (setup through cleanup) needs owner approval. Tests planned shorter may safely finish a minor unexpected overrun; material extensions require reassessment.
6. **Codex credits (PR #66, now merged to `main`):** default use up to **99% weekly used / at least 1% remaining**; **100% requires explicit task-specific permit/deny authorization and durable pre-exhaustion handoff**. Substantial assignments set a verifiable milestone and progress-based consumption checkpoint, not arbitrary credit-based stop loops. Log account-level start/end **5-hour and weekly remaining** figures, times and overlap/reset caveats; never invent numbers or credit attribution.
7. **Agent allocation:** ChatGPT Chat handles cloud-safe source/doc/planning/QA; Codex handles native/complex backend on the actual OS; Claude Code was preferred for UI-specific verification but access must be rechecked. Do not claim QA complete if designated reviewer is unavailable. The owner's instruction is to **stay in Chat**, avoid Work banners, avoid speculative scope and reduce overhead.
8. **Self-induced failures:** log demonstrable agent-caused CI/setup/QA mistakes in the existing `agents/agent_self_induced_failures.md` register and per-task usage tracker; keep required records, do not fabricate isolated credit costs. Standalone PR #57 was closed unmerged, its A-013/usage lines retained on its branch for later consolidation.

## 6. Next actions — in dependency order

### Windows Gate 3 (highest acceptance priority)

- **W1 — Windows Codex / source-only:** fix PR #67's paired-complete-traces/no-processing analyzer edge; add exact regression, run focused checks and both-platform CI; submit for independent targeted confirmation. Do not touch capture, contracts, storage, UI, recognition thresholds, PR B or private recordings.
- **W2 — Coordinator/owner:** determine whether to approve/merge corrected PR #67 into the PR #42 integration branch. Ensure no unreviewed parent drift. The approved *protocol design* is not yet an approved test.
- **W3 — Windows preflight (no recording):** confirm actual Live observer/capture path and executable config; resolve protocol `[CONFIRM]` items; hash and freeze the two independently timed prerecorded sources, scoring manifests and window including **203–214 s**; confirm safe private trace retention and resource bounds. Request explicit owner authorization for the **up-to-30-minute** test before execution.
- **W4 — Only after authorization:** run one short, isolated, instrumented true two-busy-track test; score separate detector/acoustic bounds, identify stage chains conservatively, compare with frozen evaluation without retroactive denominator changes. Decide whether PR B or more evidence is actually warranted. Audit historical worker-kill/import/picker/Pause/throughput/endurance evidence before adding tests.
- **W5 — Gate decision:** close only after required speed/memory/integrity/final-pass/import/endurance evidence, independent review and explicit owner approval. No implied Windows Gate 3 pass.

### macOS Phase 4/5 (parallel, independent of Windows Gate 3 approval)

- **M1 — Windows Codex / targeted CI diagnosis for #58:** compare the differing final-head Windows CI failures and original passing pinned base; inspect SQLite connection close/teardown, runner contention, parallelism, event waits. Do not reclassify flaky without evidence or change timeouts speculatively. Decide the smallest justifiable fix, pass targeted tests and final-head both-platform CI.
- **M2 — Mac Codex / native #58:** after CI green, verify real compiled Electron + public AMI/nonprivate fixtures + actual embeddings across recorded and imported final passes; verify persisted assignment, Undo/Redo/reopen, manual precedence, zero profile writes, cancellation/uncertain-write boundaries; preserve evidence. Independent review follows, then owner merge approval into PR #42. **Do not call this Gate 4 approval.**
- **M3 — Claude Code UI review of #64:** hold until access and owner assignment; follow the revised handoff, visual/60-second selection checks, only targeted corrections and final-head CI. PR #64 remains draft; this work does not block Windows Gate 3.
- **M4 — Planning/independent review:** finalize narrow P4-B fingerprinted, idempotent, opt-in profile growth design; then P4-C suggestions/real speaker management. Evaluate Gate 4 DER and wrong-match rate and Gate 5 correction/vocab metrics separately when implementation supports them.

### Repository integration hygiene

- **R1:** Diagnose recurring Windows CI storage timeout/`EBUSY` signature (now also on `main` at `864611398`) without reclassifying failures merely because a subsequent commit passed. Restore trustworthy CI before dependent merges.
- **R2:** Propagate approved PR #66 `AGENTS.md`/agent-allocation instructions to PR #42 stack as a separate documentation-only change after checking parent differences; do not overwrite newer branch-specific rules.
- **R3:** Keep the large PR #42 draft until its own cross-platform gate/merge prerequisites are met. Distinguish its passing CI from accepted Windows physical behavior and from the mainline merge decision.

## 7. Quick evidence index

**Repository and plans**
- [SRCB repository](https://github.com/raisinbran/scrb); [Development Plan v2.0](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20Development%20Plan%20(v2.0).md); [Development Process](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20Development%20Process.md)
- [Mac Gate 3 approved evidence](https://github.com/raisinbran/scrb/blob/2d1f8150cb68d56ec3fc842f1709f276f124ef55/docs/gates/gate-3-macos.md)
- [PR #42 Windows Gate 3 closeout triage](https://github.com/raisinbran/scrb/pull/42#issuecomment-6624082261)
- [PR #67 diagnostics handoff](https://github.com/raisinbran/scrb/blob/1905e729d329d2865929726f635890c5acdb0746/docs/handoffs/gate3-upstream-diagnostics-pr-a.md), [independent correction finding in PR #67](https://github.com/raisinbran/scrb/pull/67)

**Integration and remaining Mac work**
- [PR #42](https://github.com/raisinbran/scrb/pull/42), [PR #48](https://github.com/raisinbran/scrb/pull/48), [PR #50](https://github.com/raisinbran/scrb/pull/50)
- [PR #58 voice matching + CI](https://github.com/raisinbran/scrb/pull/58), [PR #64 UI zoom/focus + owner review hold](https://github.com/raisinbran/scrb/pull/64)
- [PR #66 weekly quota policy, merged](https://github.com/raisinbran/scrb/pull/66), [agent task allocation](https://github.com/raisinbran/scrb/blob/main/agents/agent_task_allocation.md)

**Evidence preservation:** Private owner media and local raw evidence were not copied into this handover. Treat links to PR evidence as provenance for summarized claims, not substitutes for reopening the original physical logs when a gate decision is requested.

---

**Handover disposition:** This is a factual project snapshot and proposed task ordering—not approval to merge, run physical tests, exceed authorized quota, close Windows Gate 3, or pass macOS Gates 4/5.
