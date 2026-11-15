# Three-machine recovery audit — 2026-11-15

**Status:** local inventory complete; selective preservation remains; implementation may proceed. This is the current disposition of the recovery findings, superseding the unrefreshed next-actions lists in [the earlier planner handoff](planner-handoff-20261115.md). No gate approval is implied.

**Evidence basis:** read-only local audit reports for Mac, BCHEN-W10, and Regiurn supplied to the project planner, plus GitHub checks at `main` `97080d05`. Local files and raw evidence were **not** independently opened by the planner. File counts and unpublished-state findings below are audit reports, not independently reproduced measurements. All three audits reported no local changes and no tests.

## Inventory and disposition

| Machine | Reported checkout state | Unique work / preservation | Disposition |
| --- | --- | --- | --- |
| Mac | 163 registered worktrees; 21 dirty; no staged changes | A detached Phase 4/5 checkout has two untracked historical E2E specs and an unmerged profile-list Undo/Redo UI; a process-mistakes note and an older Gate 2 local evidence commit also require preservation. Some older Gate 3 QA specs remain untracked. | Preserve unique files in durable private storage before any later cleanup. Do **not** wholesale apply old UI or native branches. No Mac code-recovery PR needed now. |
| BCHEN-W10 | 13 registered worktrees, 2 dirty; one extra standalone checkout | Two temporary scratchpad worktrees report 1,125 and 1,081 unstaged deletions; intentionality unverified. Local `main` has a divergent commit graph (382 ahead/562 behind the latest tracked `origin/main` in the audit); content uniqueness not established. | Do not reset `main`, restore deletions, or clean temporary worktrees. Resolve by read-only tree comparison only as needed. No unpublished production code established. |
| Regiurn | 3 registered worktrees; 1 dirty | Untracked A-406/A-407 draft incident records and one usage row; historical model/test assets remain private. | C: drive spike investigation **closed for active agent work**, already handed to the owner, with no new owner findings. Cause **unresolved**. Preserve drafts and evidence; do not reopen without new observations, conflate it with another task, or assert resolution. |

### Verified merge reconciliation

- Mac UI export wording, auto-delete text, and preset tip are already in merged [#284](https://github.com/raisinbran/scrb/pull/284). Local wording differences are not an authorized new scope.
- Mac native live feed from the old `phase3-macos-native` worktree is on `main`, as checked by the local audit; the old branch omits later safeguards. Reserved microphone speaker fix and test are present on `main`; the unique remaining process note is not published. Detached Phase 4/5 UI is stale aside from the unexposed profile Undo/Redo affordance, a potential future task only.
- The Mac Gate 2 local commit is historical and partly contradicted by subsequently approved gate evidence; archive it without publishing its obsolete status.
- Windows Gate 3 memory/worker-kill evidence in closed draft [#295](https://github.com/raisinbran/scrb/pull/295) was superseded by **merged [#313](https://github.com/raisinbran/scrb/pull/313)**. Do not republish it or describe it as a completed long-run or installed-build acceptance.
- All six vocabulary H1 decodes finished in merged [#292](https://github.com/raisinbran/scrb/pull/292); result **INCONCLUSIVE**, no rerun assigned.

## Gate 8 Mac: preserved failed observation

Original evidence, kept outside Git: `~/scrb-long-run/gate8-mac-20261115`. Saved `REPORT.txt` says **`RESULT: FAIL`**. Reported length **26,998.604 s** (about 1.4 s below exactly 7.5 h; verifier's stop coverage passed, but no owner-defined minimum-duration tolerance was verified). Microphone gaps **4.3469 s total** (largest **4.0379 s**), meeting track **0 s reported lost**, worst-window cross-track drift **65.81 ms** versus the under-50-ms limit, no stalled minutes. The helper exited normally; this does **not** override the failed report.

Events between approximately **05:26:49–05:29:00 PST** show microphone stream death/reopening, device changes, and transitions between 48 and 24 kHz. The owner reports an accidental AirPods connection between about 05:00 and 06:00 PST lasting at most a few minutes and no noticed Mac lag. A device transition is the leading explanation for the microphone outage, **not independently proven** because device IDs and CoreAudio error details are absent. Cause of the drift remains unproven. Retain the frozen 10 ms per-gap and 100 ms aggregate loss limits; do not amend the historical result.

**Owner update (2026-11-15):** The owner exempts the momentary microphone gaps associated with the accidental AirPods/input-device transition **from this Mac endurance assessment**. This is a run-specific interpretation, not a revision to the globally approved 10-ms/100-ms verifier limits and not permission to edit the saved **RESULT: FAIL** report. The **65.81-ms drift failure** remains unresolved; the sample-evidence flag and the 1.4-second duration ambiguity are not automatically waived. The endurance test's original scope is **unchanged**: do not require planned device switching during a long run. Investigate microphone-handover mitigation separately with short targeted tests if warranted. **No new long run or evidence cleanup is authorized by this record.** Any test expected to exceed 20 minutes requires explicit owner approval. See [the newer planner handoff](planner-session-handoff-20261115.md).

## Resumption queue

1. **Mac, preservation (short, isolated):** make verified durable copies of only the unique detached Phase 4/5 specs/commit, process note, and historical Gate 2 evidence; keep source worktrees intact. Avoid reading real audio or transcripts.
2. **BCHEN-W10, targeted preflight:** use `docs/handoffs/long-run-report-w10-failures.md` to identify the Node executable/version and run the short long-run-report tests on a clean current worktree. Do **not** launch an eight-hour recording. Separately label the two deletion-heavy scratchpads as archived/unknown after metadata comparison; do not reset `main`.
3. **Mac, summaries implementation:** slice **3a** of `docs/plans/summaries-on-install.md` following merged slice 1 [#316](https://github.com/raisinbran/scrb/pull/316), model manager [#306](https://github.com/raisinbran/scrb/pull/306) and UI [#307](https://github.com/raisinbran/scrb/pull/307). Use existing `installModelUpdate({ role: 'summary' })`, no contract change, digest-pinned downloader, summary-only success without relaunch, tests, one focused PR.
4. **Regiurn, speaker-separation benchmark (separate workstream):** approved benchmark planning is not the completed [#214](https://github.com/raisinbran/scrb/pull/214) diagnosis. Work only with public fixtures or separately authorized private ground-truth evidence; no long run by default. Avoid interference with the closed disk investigation.
5. **Docs:** [#301](https://github.com/raisinbran/scrb/pull/301) remains a dated historical handoff, not the current executable task queue. Review and merge this reconciliation separately; the owner handles all merges.

## Controls

No source work, tests, merges, restarts, manual cleanup, new gate approvals, or changes to private test evidence were performed as part of the reporting task. Reconcile any new GitHub merges at execution time. Use fresh worktrees based on current `main`, one focused PR per implementation slice, CI before independent review, and owner merge only. Keep raw audio, model output, local paths identifying people, and other private evidence out of Git. Respect the per-task usage-log and incident-report rules in `AGENTS.md`.
