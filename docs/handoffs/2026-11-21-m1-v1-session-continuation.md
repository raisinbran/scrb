# M1 / V1 current-session handoff — November 21, 2026

**Repository:** https://github.com/raisinbran/scrb  
**From / to:** Cloud M1/V1 coordination and source investigation → next coordinator, M5 Mac executor, BCHEN-W10 executor, REGIURN receiving machine, and independent reviewers  
**Evidence checkpoint:** `main` at `30b3228512367f92808b59c964f61ac832f489a9` when reviewed; recheck heads at execution.  
**Disposition:** **M1 NOT ACCEPTED; V1 NOT ACCEPTED.** This handoff is documentation, not authorization to merge, run a long test, inspect additional private meetings, or change production settings.

## 1. Critical document that has not reached main

The owner previously requested the M1 execution plan in `dev-plan/`. **It exists** on [draft PR #367](https://github.com/raisinbran/scrb/pull/367), but **has not merged to `main`**, explaining its absence in the normal folder view.

- [M1 installed delivery and acceptance plan, v2.2 (November 21)](https://github.com/raisinbran/scrb/blob/rosmont/m1-installed-delivery-session-handoff-20261118/dev-plan/m1-installed-delivery-and-acceptance-20261118.md). The plan retains two milestones: (A) installed candidates from one approved release source and verified native assets; (B) all five M1 functions on each of three installed machines (15 acceptance cells).
- [Historical November 18 handoff with November 21 addendum](https://github.com/raisinbran/scrb/blob/rosmont/m1-installed-delivery-session-handoff-20261118/docs/handoffs/2026-11-18-codex-blockers-m1-v1-installed-delivery-handoff.md). Prior Phase A0 checks are **historical**, not an instruction to repeat them.
- **PR #367 current head:** `6707c28493298325c457f89e8c48471d4e8efbac`. [Exact-head CI #44957836295](https://github.com/raisinbran/scrb/actions/runs/44957836295) **PASS**. The last recorded independent formal review was on older head `8eb50ea4`, so **fresh current-head review and owner merge authorization remain pending**. Do not keep quoting its November 18 Windows CI failure as the current gate.
- To publish: review the revised v2.2 plan against current `main` and issue #340, inspect only changed content, confirm exact-head CI and 12-column accounting compliance, obtain a **separate-session formal review** at the latest head, then request owner approval to **squash-merge** #367. Branch removal only after the merged plan is verifiably in `main` and no dependent worktree needs it. Do not create a duplicate M1 plan.

## 2. What this sequence established

### November 20 private Teams/Scribe evidence (M5 Mac)

The owner expressly authorized **one named November 20 meeting** for local-only analysis; a one-time up-to-120-minute task was completed in **64 minutes 7 seconds**. **That authorization was used** and is not a standing authorization for new >20-minute tests, additional private meetings, cloud uploads, or repeat inference.

- The earlier Mac "missing FFmpeg/models" report was a discovery/execution-context error. Previously verified Mac six-tool/17-dylib bundles and five pinned models were found and executed successfully. Avoid a new generic tool search, download or rebuild.
- Scribe transcript: **9,278 tokens**; Teams transcript: **9,422**; edit distance **985**, or **10.45% relative to Teams**. This is **not** audio-adjudicated WER. Teams participant identities are the primary reference for meeting participants, but individual speech turns still require acoustic corroboration under crosstalk.
- M5 decoded Teams audio, analyzed **37 mapped Scribe windows**: **35** reference-centroid-scored windows covering T2–T5 (8 + 9 + 8 + 10), plus **two T6** windows excluded from those four scoring groups. Do not turn the centroid matches into a calibrated accuracy percentage.
- Owner hearing confirmed overlapping voices in E04, E13–E15 and additional voices in E16–E18; this narrowed the inquiry without producing a definitive whole-meeting six-to-five speaker mapping. T4 has no owner-listened reference in the prepared set.
- **Confirmed saved-speaker mislabel, E14:** among **four selected, evaluable non-overlapping portions** there were three correctly attributed and **one confirmed wrong stored/displayed speaker event** at the T3→T5 turn (T5 speech shown as S1, expected S4). **This is not a 25% population error rate.** E04 preserved separate S2→S1 labels; other excerpts were overlapped, poorly aligned or insufficiently covered. **No confirmed global merge/split**.
- The original producing Scribe source SHA/model configuration is **UNKNOWN**. Do not substitute the installed current build or current `main` by inference. Existing detailed audio, transcripts, participant identities, private paths and speech embeddings remain exclusively on M5, not in GitHub.
- [Cloud source-path investigation, #340 comment 7070124583](https://github.com/raisinbran/scrb/issues/340#issuecomment-7070124583) established that missing/overlapping Sherpa spans, fallback nearest-span word assignment, post-final speaker-ID transfers, overrides, merges or display names **can** change a saved/displayed label. **None has been proven to cause E14**. Normal persisted final transcription does not retain the full raw diarization span timeline. Do not replay an hour of inference merely to look for a span that was never persisted.

### Public AMI research — separate from installed acceptance

- Owner selected **Option B**, a diagnostic public-AMI comparison. M5 prepared **14 annotation-selected 60-second candidate windows across seven meetings**: four one-sustained-speaker, seven two-speaker and three 3+-speaker windows. No AMI inference has been run for this new cohort.
- The prior public screen's three solo controls and exact eight windows are not recoverable; **candidate cohort NOT FROZEN as independently held out**. Do not claim DER or change the production Sherpa oversplit threshold from **1.0** to research candidate **0.8**.
- [PR #403](https://github.com/raisinbran/scrb/pull/403), Mac-portable isolated AMI runner at `2182c301`, has [green exact-head CI #44937558252](https://github.com/raisinbran/scrb/actions/runs/44937558252). Previous independent **REJECTED** review was on an older head; a **new independent current-head review** is required before using it. The completed Nov 20 private meeting analysis did **not** run #403.

### Packaging and real Windows execution

- Source-level packaged Mac Copy validation and renderer-provenance protection were demonstrated in earlier work, but **a fresh common installed release candidate has not passed all five M1 steps**. A toast or source-visible Copy button is not clipboard parity.
- [PR #402](https://github.com/raisinbran/scrb/pull/402) at `ca74ff57` has [passing Windows/macOS CI #44927567667](https://github.com/raisinbran/scrb/actions/runs/44927567667) and [hosted guard #44927567675](https://github.com/raisinbran/scrb/actions/runs/44927567675), plus a formal source/guard **APPROVED** review. **Its genuine seven-tool producer and disposable standard-user NSIS install/uninstall jobs were skipped**, not passed. It is stacked on [draft #376](https://github.com/raisinbran/scrb/pull/376) with its own incident/merge gates. It is **not merge-ready** merely because guard CI is green.
- **REAL W10 AUDIO CAPTURE: BLOCKED — NORMAL-USER EXECUTOR UNAVAILABLE.** The W10 Codex process was observed under excluded `CodexSandboxOffline` and must not bypass sandbox controls. A hosted installer smoke can advance separately, but it does not prove physical Windows microphone/meeting recording.
- REGIURN remains the Windows receiving/clean-install evidence lane once a trusted installed candidate and normal-user execution route are available. Do not treat an unpacked executable or simulated library as M1 installed acceptance.

## 3. Five M1 steps still required, on a known installed build

[Issue #340](https://github.com/raisinbran/scrb/issues/340) tracks acceptance. The owner requires **one known-build recording** to establish all five functions:

1. Non-silent, separately preserved **microphone and meeting audio tracks**.
2. **Live** provisional speech grouped by actual remote speakers while recording (cannot be proved retrospectively from saved final words).
3. Completed final transcript with **meaningfully correct remote voice attribution**, noting coverage, overlaps and wrong labels rather than counting labels.
4. **Audible** timestamp click-to-seek with measured landing, not only transport movement.
5. **Complete** final-transcript Copy, including virtualized/offscreen text, verified against clipboard contents.

Do this for **Mac M5, BCHEN-W10 and REGIURN**, on artifacts tied to a **single approved final release-candidate source SHA**, with separately recorded per-OS native/tool/model/package provenance. This is a **15-cell** evidence matrix (five per machine); present status **0/15 certified against a common final installed RC**. Preserve restart persistence separately. No full end-to-end M1 acceptance has been authorized by component CI or old historic source runs.

## 4. Exact next assignments — no repeat loops

| Priority / owner | Bounded action | Stop condition and expected result |
| --- | --- | --- |
| **P0 M5 Mac, read-only E14 metadata** | In the **already identified private E14 record only**, distinguish `RAW_FINAL_ID`, `EFFECTIVE_ID`, `OVERRIDE`, `MERGE_ALIAS` and `DISPLAY_SOURCE` (default/name/profile). Use existing saved word/segment metadata and the local app/library reader that respects its isolation; no new audio, recording, listening or inference. | Return five anonymized fields and whether S1 originated before or after persistence/display. If the raw state is unavailable, report `UNKNOWN` once. Never publish private transcript text. Follow [#340 source triage](https://github.com/raisinbran/scrb/issues/340#issuecomment-7070124583). |
| **P0 cloud engineering triage, after E14 check** | Reconcile the metadata with four invented-only boundary/regression cases: clean adjacent spans, missing/nearest fallback, overlap/tie, and post-final override/merge/display. Determine whether a specific code defect is reproducible. | Do **not** claim source root cause, implement blind 1.0→0.8 threshold changes or order another hour-long private re-final-pass without evidence/approval. If a small fix is justified, propose a focused production PR with tests, exact-head CI and separate-session independent review. |
| **P0 Windows cloud producer / #402 owners** | Finish *actual* trusted seven-tool source production, verifiable artifact provenance, protected producer-to-consumer transfer, genuine NSIS installer install/launch/uninstall by disposable standard user. Resolve #376/#402 dependency and independent-review gates. | Report **genuine hosted install PASS** only if producer and consumer actually ran. Avoid repeated guard-only passes disguised as acceptance or unauthorized source/build substitutions. Planned tests >20 min require owner approval. |
| **P0 M5 Mac packaging and REGIURN receiving, parallel** | Prepare signed/known-source Mac install with safe rollback and non-destructive installed smoke; prepare REGIURN to receive the exact validated Windows installer. Preserve existing owner library, recordings, recovery snapshots and dirty worktrees. | Do not replace the owner’s working Mac app without safe-idle and explicit authorized rollout. Report one precise missing permission immediately rather than restarting broad preflight. |
| **P1 cloud #367 publication** | Finish **current-head** formal review of M1 plan v2.2 / corrected handoff, verify green exact-head CI and usage/incident register, then present owner the reviewed merge decision. | Do not self-approve or merge without owner consent; ensure `dev-plan/` becomes visible on main after merge. |
| **P1 cloud #403 research** | Obtain independent exact-head review of corrected Mac runner. Later obtain *separate* explicit authorization and credible timing basis for the proposed public Option B run. | Remains draft/unmerged and **not** a substitute for installed M1. No inference while the approval and data-independence caveats remain unresolved. |

**Coordination invariant:** If an assigned agent hits missing capability, location, access or time authorization, it must ask **one exact actionable owner question on the first genuine blocker**. Reuse known paths, verified Mac tools and previous data; do not waste credits on repeated full scans, blocked sessions, or duplicate tasks. One task should produce one meaningful result or a precise stop condition. Do not launch a local Codex session merely by posting to GitHub.

## 5. V1 parallel lane — independent of the above M1 tests when properly scoped

[Issue #49](https://github.com/raisinbran/scrb/issues/49), [issue #335](https://github.com/raisinbran/scrb/issues/335), and [merged PR #401's audit](https://github.com/raisinbran/scrb/pull/401) identify the outstanding V1 behavior:

- **Already implemented:** the cross-tab title-bar processing indicator (#360). **Do not duplicate** it. Hybrid/mock meetings may still falsely contribute to real processing claims: propose a narrow real-only input verification and packaged runtime check.
- **Not implemented:** safe confirmation before intentionally quitting during live recording or final transcription. #401 supplies a plan; lifecycle, IPC or security changes need **separate owner approval**, preserving audio sealing, cancellation, Windows last-window close, macOS Quit and interrupted-final-pass restart behavior.
- **Settings source truth:** several audio presets/filters, gain/sensitivity, advanced VAD, update/revert controls and Change storage location are stored or mock-backed, not necessarily active in normal capture. Preserve real selections, Performance, model downloads, retention, privacy, theme and other proven consumers. Mark unsupported features honestly unavailable/hidden or implement only via a focused independently tested, approved change; do not turn on experimental AEC by default.
- **Further V1 work:** verified installed tooltips/layout/accessibility, working voice profiles across restarts and merges, safe audio presets, model-management truthfulness and additional polish. Use distinct scoped UI/backend branches under the `AGENTS.md` boundaries. Do not block M1 hardware/inference work for unrelated V1 display tasks; do not claim V1 finished solely because UI renders the controls.

Cloud-side V1 source reviews and documentation may proceed without touching M5/W10 recovery, local recordings or model runs. Actual installed-app feature acceptance still needs a known real build and appropriately authorized testing.

## 6. Open administration and review gates

- [PR #404](https://github.com/raisinbran/scrb/pull/404), M5 cohort accounting: exact-head `11993209` CI **PASS** and formal **APPROVED**, **still draft and unmerged**; owner merge permission remains separate.
- [PR #407](https://github.com/raisinbran/scrb/pull/407), E14 cloud read-only causal-triage accounting/incident A-1028 and A-1029: exact-head `a25f6f0d` CI **PASS**, **no formal review at checked head**; draft/unmerged.
- [PR #396](https://github.com/raisinbran/scrb/pull/396) is a continuously updated **draft accounting branch**; its earlier approvals do not carry forward to newer heads. Do not treat a prior review as a blanket merge approval.
- [Issue #358](https://github.com/raisinbran/scrb/issues/358): M5/W10 multiple local usage rows and incident reservations remain unpublished/overlapping; preserve verified recovery snapshots and original evidence. Recheck merged main, open PRs **and unpublished local reservations** before renumbering. Do not fabricate clock/allowance values or publish private paths. Keep accounting parallel to the M1 engineering critical path.

**Mandatory repo rules:** consult `agents/agent_task_allocation.md` before delegation; no `pde-gh-write` workflow, no attribution lines, no unapproved `packages/contracts/` / Electron security / IPC changes; run appropriate CI and register checks **before** independent formal review and **before** owner-authorized merges; retain recordings/evidence until explicitly approved for cleanup. Any task planned >20 minutes total needs **task-specific prior owner authorization**, except the already completed, one-time November 20 local analysis. The code and data on a PR head are not certified installed runtime merely because CI passed.

## 7. Handoff publication / what the next coordinator should do first

1. Confirm the actual current `main` SHA and all PR heads; this document's checkpoint is dated.
2. Complete the single **E14 read-only metadata check** or record an exact unblock; keep the cloud causal analysis ready.
3. Independently review **PR #367** at its updated plan/head and clear its administrative publication; this is how the missing M1 plan becomes visible on main.
4. Continue the genuine Windows installed-candidate producer/consumer and Mac safe packaged delivery on their existing, separate branches, preserving all local evidence.
5. Plan the known final installed RC and owner-observed 15-cell test; do not claim acceptance from individual synthetic/public model results.
6. Keep V1 #49/#335 work and accounting publication independent from device M1 critical path.

**No new user instruction, hardware test, inference, private meeting review, merge or owner permission is created by this handoff.**
