# Planner handoff, 2026-11-15 — archived snapshot with 2026-11-16 corrections

Original 2026-11-15 snapshot; it is **not an active task list**. The agent and machine information below describes historical assignments, not current availability. Supersedes the untracked `planner-handoff-20261114.md`. Owner is non-technical: give exact clicks and name the PC, app, folder and admin yes/no for every command. The owner merges every PR (Ready for review, Squash and merge, Confirm squash and merge, Delete branch). Never merge for the owner.

**Refreshed 06:21 PT, 2026-11-15.** Covered: PR states from `gh pr list` (all of 277 to 317 except 301 are merged; open: 301, 253, 223, 213, 210, 131, 138 to 135, 95 to 87, 25; 285, 295 and 297 closed) and the Mac Gate 8 run log (see section 2: still running at 06:21 PT, 19,260 s of the planned 28,800 s, chunks mic 3,853 and meeting 3,850, helper 33 MB, free disk 132 GB, every line `ok`, no `REPORT.txt` yet, so no result). Not verified: the run result after 06:21 PT, CI on open PRs, and whether the confirm commands in the W10 note still need a W10 run (they do until a W10 session runs them). The owner left #301 open; it is not marked ready.

**Earlier refresh 08:45 PT, 2026-11-15.** Covers PR state as of the last `gh pr list` (read at 05:13 PT by the scheduled refresh) and the Mac Gate 8 run as of its last log line (05:13 PT). It could not verify anything that happened after that: the run result, later merges, or CI on open PRs. Re-check `gh pr list` and `REPORT.txt` first. Sections 3 and 3A below were written earlier and are partly out of date; section 1, 2, 4 and the next-actions list in section 1 supersede them.

## Corrections verified 2026-11-16

**Do not execute older merge, testing, or delegation steps in this handoff.** Before publishing or assigning work, fetch current `main`, open PR status, exact-head CI, and independent reviews; compare all proposed changes with `main` to avoid redoing already merged work (including #284). This file's dated list of PRs is historical, not current merge authorization.

- **Mac Gate 8: FAIL, not pending or PASS.** The completed report recorded 26,998.604 s (7:29:58.604), 4.3469 s total mic gaps (largest 4.038 s), and 65.81 ms worst four-hour drift versus the 50 ms limit. Meeting-track continuity passed, but microphone evidence did not. Preserve all evidence; perform metadata-only diagnosis before proposing a retest, and obtain fresh owner approval for any test expected to exceed 20 minutes. The earlier permission to shorten the run was **not** approval of the failed result.
- **Vocabulary H1: six of six decodes complete; INCONCLUSIVE** per merged #292. Do **not** schedule unfinished H1 decoding, or describe only one decode as completed. Any new experiment requires separate scope and authorization.
- **PR/task sequencing:** #284 was merged; treat the old numbered PR lists and model-download sequence below as historical. Recheck the live repository before giving a merge order, and never treat earlier approval of a stacked PR as review of its base.

## 0. Hard rules (every agent, every prompt)

- No `Co-Authored-By`, no "Generated with" or other attribution lines, no agent names in PR text ("independent review"). Branches `cuc/...`. Each task: one new usage-log file in `agents/usage-log/`; each agent mistake: one new file in `agents/incidents/` (A-400 to A-417 are taken or reserved; check open PRs before choosing a number). Never merge. Owner's real recordings are confidential: never read, quote, commit or share.
- Contract changes (`packages/contracts/`), IPC and security settings need owner approval and a written plan. Colors only in `tokens.css`. UI code only in `apps/desktop/src/ui/`.
- Tests expected to exceed 20 minutes need explicit owner approval first. Never delete gate evidence.
- Every prompt opens with `PASTE INTO:` (session, model, PC, folder, admin yes/no). The `pde-gh-write` approval/publication/merge workflow is permanently prohibited; use direct GitHub operations, exact-head CI, independent review, and owner-only merges.

## 1. PR state (historical 2026-11-15 refresh; not live)

Merged on main (head 97080d05 when read): 277, 278, 279, 281, 282, 283, 284, 286, 287, 288, 289, 290, 291, 292, 293, 294, 296, 298, 299, 300, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317. Closed without merge: 285, 295 (replaced by 313), 297 (replaced by 310).
Open, not for the owner to merge yet: 301 (this handoff, awaiting independent review). Open and old or on hold: 253, 223, 213 (superseded by 294, close), 210, 131 (typed notes), the Rust PRs 87 to 95 and 135 to 138 (do not touch), 25.
Not seen as PRs at read time: #264, #275, #276, #280 are not in the first 60 PRs listed as open; check their state with `gh pr view` before relying on them.

The five-step action list from this dated snapshot is retired. For any new assignment, verify the current branch/`main`, open PRs, author-independent review, exact-head CI, active work, owner approvals, and the current gate evidence. Do not start an overnight run from the old instructions.

## 2. Mac Gate 8 run — completed, FAIL

The completed 2026-11-15 report recorded **RESULT: FAIL**. Timeline was 26,998.604 s (7:29:58.604), which is 1.396 s below a strict 7.5-hour minimum. Mic gaps totaled 4.3469 s (largest 4.038 s); worst four-hour drift was 65.81 ms versus the 50 ms limit. Meeting continuity passed, but microphone sample and gap-cause evidence had defects. Device-change/stream-reopen events occurred around 05:26–05:29 PT, including 25 temporary 24 kHz mic chunks. This replaces the earlier in-progress log excerpts and invalidates any implication that the result was unknown or accepted.

Preserve raw audio and diagnostics outside Git; the next step is **offline metadata-only investigation** of per-rate frame accounting and gap attribution. No unattended rerun, deletion, or gate sign-off is authorized by this historical handoff. Windows long-run failures remain FAIL until separately revalidated.

## 3. What holds back the gates, M1 and V1

M1 (usable for real meetings): owner used real mode on the Mac on 2026-11-14 and filed 31 feedback items (`owner-feedback-real-meeting-20261114.md`). Most UI items are in the PRs above, waiting on merge. Open for M1:

1. Speaker separation on the owner's real meeting: only two speakers appear. #283 found no safe default change; the current embedding barely separates the voices (cause is an unverified hypothesis, no ground truth). Owner says accent handling is fine; what is needed is a model that reliably separates speakers. Next step needs owner approval: a fixed speaker-separation benchmark on AMI plus a ground-truth snippet of one real meeting (Regiurn, 1 to 2 hours, medium to high credits). A "number of remote speakers" setting is NOT approved.
2. Summaries cannot be generated on a normal install: engine, `generateSummary`, `cancelSummary` and storage are merged, but the model and llama.cpp are not shipped or downloaded and nothing auto-generates; export of summaries is refused by the real export handler. Plan in #291 (five slices; the proposed automatic-summary setting is NOT approved). Biggest unknowns: model download size and generation time (about 15 min per meeting in one test).
3. First-launch model download: manager merged (#201) but not routed or shown in the UI; plan in #298 (contract additions need owner approval).
4. Native Export save dialog and `revealExport`: owner approved the two contract calls (2026-11-15), pending independent review of the plan (#291). `getProfileClips` approved too (slice 2 of voice preview). Not approved: short replies setting, export checkbox "Group transcript by outline", automatic-summary setting.
5. Owner items still open: item 27 (summary stale warning answer), model dropdown/benchmark contract fields (plan #280), Settings model choice, final app icon, typed-notes fill (#131).
   V1 gates: Gate 3 Windows: live-latency accepted 2026-11-10 and Wave 1 substitutes 2026-11-12; memory and worker-kill now measured on W10 in #295 (peak working set 1,405 MiB, private bytes 1,801 MiB vs 6,144 MiB; kill restarted in 4.1 s; 112 chunks intact; one 7-minute run, development launch, so a lower bound). Still open: GPU-capable final-pass speed (whisper builds CPU-only on Windows, about 2x real time on Regiurn), final-pass 15% on one clip (owner decision), import formats 21/21 (owner decision). Gate 4 speakers: not claimed. Gate 5: persistence passes; vocabulary hint benefit unproven (H1 below). Gate 6: recall 68% vs 80% target, precision judged 32%: owner decision on bar or model. Gate 7: Mac passes, Windows run and owner click-through missing. Gate 8: Mac long run FAILED; Windows reruns, installer/signing, upgrade and offline tests, USB mic 44.1 kHz, manual with screenshots, SP-06 optional check open.
   Vocabulary H1 (Regiurn): all six decodes finished under merged #292; verdict INCONCLUSIVE. No remaining decode assignment.

## 3A. Retired 2026-11-15 paths to M1, V1 and each gate (historical only)

**This section is archival and contains superseded PR numbers, status and dependencies. Do not execute it as a live plan; re-evaluate each proposed change against current `main` and independent review before authoring or merging.**

Rules for every step: one session per step, branch `cuc/<name>`, draft PR, CI green on macOS and Windows, independent review (ChatGPT) before the owner merges, a usage-log row (new file in `agents/usage-log/`), an incident file per agent mistake, and a `PASTE INTO:` header on every prompt (session, model, PC, folder, admin yes/no). Credit levels: low under 3% of a weekly allowance, medium 3 to 10%, high above 10% (estimates, not measured). Anything marked OWNER needs a yes in chat first.

### Path to M1 (usable app for real meetings; fastest first)

1. Historical merge order is obsolete: #284 and the other listed changes have since moved; check current `main`, PR state, independent approval and exact-head CI before considering any remaining merge. No merge is authorized by this document.
2. Historical PR review queue is obsolete. Never use this old queue to assign fixes: compare each candidate with `main` and current exact-head CI, then request a fresh independent review when appropriate.
3. Native save dialog (slice 1): PR from the `save-dialog-impl` session; touches IPC, so it needs ChatGPT review plus an explicit security check that names are allowlisted in preload and main. Claude Code, Mac, medium. Done when Export asks where to save, shows "Saved X." with Show in folder, and the e2e smoke passes.
4. Voice preview slice 1 (#299, no contract) then slice 2 (`getProfileClips`, approved). Claude Code, Mac, low then medium. Done when a person can hear a speaker clip before splitting, and Stop silences audio within one audio buffer.
5. Speaker separation, the largest M1 blocker. OWNER yes needed for the benchmark. Regiurn Codex or Claude, 1 to 2 hours, medium to high: build a fixed benchmark (AMI meetings with ground-truth speakers plus one ground-truth snippet of an owner meeting kept outside git, never committed), score the current embedding and 2 to 3 alternative embedding models, report separation (same-speaker versus different-speaker similarity gap). Done when one model clearly beats the current one on the benchmark, or the result says none does; only then plan a model swap (needs a plan, review and approval). Do not add a "number of remote speakers" setting (not approved).
6. Summaries on a normal install (historical outline, not a current task order): first-launch model-download work has a no-contract first slice; only later contract additions need owner approval. Follow current merged slices and plans instead of this old sequence: (a) first-launch model download UI, (b) ship or download the summary model and llama.cpp, (c) Generate summary button, (d) export of summaries, (e) optional automatic summaries (NOT approved). Claude Code, Mac, high in total; do (a) and (b) before anything else. Done when a fresh install can generate and export a summary with no manual steps.
7. Owner click-through on a real meeting after steps 1 to 4, filing feedback in the same numbered format as `owner-feedback-real-meeting-20261114.md`. M1 is met when the owner records and reviews one real meeting, with correct speaker labels or an accepted known limit, and exports it.

### Path to V1 (Gates 4 to 8 on both machines)

Order by what can run in parallel: Gate 8 Mac and Gate 7 Windows can run now; Gate 4 needs the step 5 benchmark; Gate 6 needs an owner decision; Gate 8 needs installers last.

- Gate 3 (Windows, record closure): merge #295. OWNER decisions: is one clip enough for final-pass 15%; do the 21/21 imports stand; does CPU-only final-pass speed block (about 2x real time on Regiurn). If speed blocks, build whisper with GPU support on Regiurn (Claude or Codex, medium; done when the final pass runs at least 5x real time on the RTX 3080 with equal accuracy).
- Gate 4 (speakers): after step 5. Accuracy and wrong-match targets are in the Development Plan (line 173 of v2.0). Also the owed Phase 4 task: find where overlapped speech is lost (silent offline measurement first). Regiurn, medium. Not claimed until measured.
- Gate 5 (corrections and vocabulary): persistence passes. Vocabulary H1's six decodes are complete; verdict INCONCLUSIVE per merged #292. No further H1 decode assignment or hint-feature release is authorized here.
- Gate 6 (summaries): recall is 68% against the 80% target and precision was judged 32%. OWNER decision: lower the bar, or improve the model or prompt (needs step 6 first). Evidence in `docs/gates/gate-6*.md`.
- Gate 7 (import, find, review, export, delete): Mac passes (`gate-7-mac-walkthrough-20261114.md`). Windows: Claude on W10 (low to medium) runs the same walkthrough on a built app and records evidence; then the owner clicks through once on each machine.
- Gate 8: Mac 2026-11-15 run FAILED (section 2). First investigate the existing evidence offline. Any new Windows/Mac long run or installed-build acceptance requires current scope, equipment and owner authorization, not this old instruction.

### Review and relay loop (use this every time)

1. Session finishes: you check `gh pr view <n>` head SHA and `gh pr checks <n>` yourself.
2. Send ChatGPT the PR link, head SHA and the CI table; ask for P0/P1/P2 findings only.
3. Verify each finding against the code; send the real ones to the owning session as exact fixes (smallest fix).
4. Re-review on the new head; then tell the owner "ready to merge" with the exact buttons (Ready for review, Squash and merge, Confirm, Delete branch).
5. After every merge, rebase the next stacked PR and re-check CI before telling the owner.

### Traps seen this session

Heavy tests on the Mac under load time out and get blamed on code: run them through `~/scrb-dev-assets/heavy.sh`. Do not run more than three Claude sessions at once on the Mac (six froze it, A-417). Never edit a script that is running. Always pass `--out` to `overnight-mac.sh --hours` until the bug is fixed. Never read or commit the owner's real recordings.

## 4. Owner decisions (current at 05:13 PT)

Decided 2026-11-15 (owner, in chat): Windows Gate 3 closure accepted (one clip enough for final-pass 15%; 21/21 imports stand; CPU-only final-pass speed does not block); speaker benchmark approved (Regiurn); Gate 7 Windows walkthrough approved and passed on W10 (#304); all seven decisions in the summaries plan (#312) approved yes; Mac Gate 8 shortened run accepted.
State: model download slice 1 merged (#306 backend, #307 UI). Summaries on a normal install slice 1 merged (#316: pins, packaged paths, optional status row); next is slice 3a. Vocabulary H1 is INCONCLUSIVE after all six decodes completed (merged #292). Design guide for UI work is merged at `docs/design/scribe-design-guide.md` (#314, checked against main on 2026-11-15; says "not implemented" where something is not built).
Still open, ask the owner with a recommendation each: Gate 6 bar (recall 68% vs 80%, precision judged 32%); item 27 follow-up if any; close old PRs (#213, Rust PRs); "Group transcript by outline"; typed-notes fill (#131); final icon; No H1 decoding remains to schedule. Not approved: short replies setting, automatic-summary setting, a "number of remote speakers" setting.

## 5. Machines and agents

Mac: M5 MacBook Air, 10 cores, 16 GB. Regiurn: i7-14700K, 32 GB, RTX 3080 (preferred for long heavy runs). BCHEN-W10: Xeon W-11855M, 64 GB, RTX A3000 (has shut off unexpectedly 3 to 5 times in about 4 years, per the owner: rare, so commit and push early but do not treat it as unreliable). Claude weekly allowance was 82% used at 01:40 PST (shared by chat and Code); Codex had 21% weekly left (owner's figure). Plan: stop at 99%, durable handoff before running out (owner decision 2026-11-08). Branch and usage rules in `agents/agent_task_allocation.md` (policy only; do not open `agents/usage-log.md`).

## 6. Observed agent strengths and weaknesses (this session, 2026-11-14 to 15; evidence is thin outside the first three)

- Claude Code (Sonnet 5.5): strong at implementation, test writing, plan drafting and fast review-fix loops; stops cleanly when told. Weaknesses: parallel sessions can freeze the Mac (A-417); local checks time out under load, then get blamed on the code; hidden-label and stale-cache style regressions slipped past local tests (#286, #289) and were caught by CI and review; sessions report "done" while CI is pending, so always check heads and CI yourself; the planner (me) gave outdated merge lists and untested script flags, which cost owner time.
- ChatGPT (independent reviewer): the most useful reviewer here. It repeatedly found real P2 defects (race overwriting a rename in #294, out-of-order responses in #286 and #289, keyboard access in #278, lost cautions in #279, unsupported timing claim in #291, overclaimed causes in #283). Weaknesses: cannot run code, so it reviews against CI and reads; some rejections are wording-only; verify each finding before sending a fix. Rejected 9 of 11 PRs in the first round; most were fixed in one pass.
- Codex: good at well-specified Windows runs and at stopping when prerequisites are missing (H1 stopped twice, correctly, when audio pins and the plan files were absent), but burns weekly allowance fast and its first runs missed prerequisites that the prompt should have listed. Give it inline plans, pinned inputs and a hard time cap.
- Claude on Windows (Regiurn, W10): did the memory/worker-kill run well, with an honest incident log; exceeded the approved time by about 6 minutes and made a harness mistake (A-412).
- Codex on its lowest standard model at high effort (owner correction, 2026-11-15): credit use per task is pretty low, so it is a good default for well-specified runs. It is not the smartest agent, so give it detailed, inline, step-by-step instructions with pinned inputs and a time cap; the prompts written in this session have been sufficient so far.
- Strata/Qwen: no evidence in this session; do not rely on it for review without a trial.

## 7. Handoff checklist for the next planner

1. Check `gh pr list` states before giving any merge list (the owner has corrected stale lists twice).
2. Mac Gate 8's 2026-11-15 report is FAIL; preserve evidence and investigate metadata before considering a new run.
3. Send ChatGPT review prompts for the "not yet reviewed" PRs, then route findings to the owning session.
4. Ask the owner for the open decisions in section 4 with a recommendation each.
5. Fix the `--hours` script bug in its own PR.
