# M1 and V1 path forward (Claude-managed)

**Date:** 2026-11-23 PT. **Base:** main `681cd4e5`. **Status:** owner approved decisions O1–O5 on 2026-11-23 (O6 is asked when the Mac B0 run is ready). The plan still gets one independent review round (planning-role rule).
**Roles:** a **Claude Code Sonnet** session is the primary planner and coordinator. **Claude Code Opus** oversees quality: reviews plans and high-risk changes, does independent QA, and handles emergencies for the owner. Work is allocated per [agent_task_allocation.md](../agents/agent_task_allocation.md).
**Supersedes for sequencing:** the next-action sections of [m1-installed-delivery-and-acceptance-20261118.md](m1-installed-delivery-and-acceptance-20261118.md) (v2.2) and the PR 456 handoff. Their evidence and the owner-approved acceptance content (the B0 30-turn protocol, the 15-cell M1 matrix, the 14×2 V1 matrix) stay valid.

## 1. Where things stand

- **Gates:** 0, 1, 2 and Mac Gate 3 approved. Windows Gate 3 partly evidenced (latency risk accepted Nov 10, memory/worker-kill pass Nov 15) but not closed. Gate 5 persistence 35/35 and Gate 7 walkthroughs passed as evidence only. **Gate 6 summary recall failed (27/40 = 68% vs 80%). Mac Gate 8 overnight failed (65.8 ms drift vs 50 ms).**
- **M1:** 0/15 installed cells verified. The last frozen candidate (`73e899d0`) showed four of five functions but its package lacked Copy transcript. One confirmed final speaker mislabel (E14, #340); root cause unassigned.
- **Packaging:** Mac b75 package built but aborted (SIGABRT) during macOS app registration when launched from Codex's sandbox. A normal-user launch has never been tried. Windows: local packaging slices 2–3 merged (#339, #346, #368, #370); the hosted NSIS workflow never ran (skipped at its job guard).
- **Source gaps for V1** (from the [V1 matrix](../docs/acceptance/v1-installed-acceptance-checklist-20261122.md)): functional audio profiles (V13) not implemented, #443 only marks them unavailable; licenses list is empty (`getLicenses` returns `[]`, V14); vocabulary learning stage 2 on hold (V06); summary recall below target (V10); 8-hour drift (V03); live two-remote-speaker grouping unproven (V04).
- **Open PRs:** 37, of which ~25 are accounting/handoff drafts. Code PRs waiting: #444 quit guard, #443 audio controls, #452 retention test, #454 workflow diagnostics, #420 encrypted transfer, #350, #213, #210, #253, #137, #138, dependabot #389/#385. Fixes from this review: #458 and its companion docs PR.

## 2. Owner decisions

**O1–O5 approved by the owner on 2026-11-23.** O5: Option B, with **Scribe** as the app's name and **scrb** as its shorthand for repo and package names.

| ID | Decision | Recommendation |
| --- | --- | --- |
| O1 | **Re-baseline M1 order:** Mac installed M1 first, then Windows, instead of a single three-computer freeze | Yes. The owner uses the Mac daily; M1's goal is a usable app for real meetings soon. Windows follows on the same or a later SHA, each recorded on its own |
| O2 | **Windows installer route:** build NSIS locally on Regiurn (or BCHEN-W10) with Claude Code, install as a standard user, keep the installer locally; park the hosted zero-upload workflows (#431 and the older smoke workflow) and #420/#454 | Yes. The hosted route was built around Codex's inability to dispatch or run GUI on the PCs. Local build plus recorded hashes is enough for a personal-use app |
| O3 | **#342 contract change** (139-character word IDs) | Approve as-is: it only widens one validator for generated live word IDs, with tests |
| O4 | **Accounting batching** (see allocation proposal): one usage row per assigned task, carried in that task's PR; minor tool errors from one task grouped in one incident file; no standalone accounting PRs | Yes. Keeps the rules and removes most of the churn |
| O5 | **Repo obfuscation** level (§6) | Option B now; C on request |
| O6 | Approval for the >20-minute B0 run on the Mac installed build (when §3 step M3 is ready) | Ask at that point, not now |

## 3. Milestone M1 — work plan

Each step names the agent and computer. "Done" is the exit check. Steps in the same lane run in order; lanes run in parallel.

**Lane 0 — clean-up (Sonnet planner, cloud/GitHub; 1 day)**
- M0.1 Get #458 and the companion docs PR reviewed (Opus or ChatGPT reviewer, not the author) and owner-merged.
- M0.2 Close superseded accounting/handoff drafts (list each with a one-line reason; owner confirms in one batch). Keep #444, #443, #452.
- M0.3 Review and merge #444 (quit guard) and #452 (retention test flake, issue #380) — both affect install-time behaviour and CI noise.
- Done: open PRs list only live work.

**Lane A — Mac installed M1 (Claude Code on the Mac)**
- M1.1 Build a package from current main on the Mac **outside any agent sandbox** (normal user terminal, the owner runs the one command if needed), with an isolated temp profile and library per AGENTS.md. Launch it once. Done: app starts, backend opens the temp library, or a crash report is captured.
- M1.2 If it still aborts: read the crash report and unified log once (Opus), one hypothesis, one fix. Stop rule applies (two identical failures → stop and report).
- M1.3 Speaker mislabel E14: Sonnet plans, Opus reviews. Read the stored raw/effective speaker IDs at the known position on the owner's Mac (read-only, ≤5 min, no transcript text leaves the Mac), then fix in `packages/transcription` or storage override resolution with an invented-data regression test. High-risk only if it touches correction precedence (then owner-approved plan first).
- M1.4 Freeze `MAC_RC_SHA`; package; record package hash, model manifest and tool list in a short evidence file under `docs/gates/`.
- M1.5 Install over the owner's existing app with rollback preserved; run the frozen B0 30-turn protocol (needs O6). Done: all 15 M1 cells for Mac recorded PASS/FAIL with evidence; restart persistence checked.
- M1.6 Owner uses the build in real meetings; feedback goes to issues, not new plans.

**Lane B — Windows installed M1 (Claude Code on Regiurn; BCHEN-W10 as second host)**
- W1.1 (after O2) Local NSIS build from `MAC_RC_SHA` or newer on Regiurn using the merged staging scripts (`scripts/stage-win-tools.mjs`, `scripts/package-win-installer.ps1`). Record installer SHA-256 and tool/model manifest. Done: installer exists with manifest.
- W1.2 Standard-user install, launch, uninstall on Regiurn (≤20 min). Then install for B0.
- W1.3 Close Windows Gate 3 with the evidence already accepted plus this installed run; owner approves.
- W1.4 B0 on Windows (needs its own >20-minute approval). Done: Windows M1 cells recorded.

The owner's pre-M1 UI items (current word follows playback, smaller minimum window) are already merged (#129, #168; minimum 800×560); only verify them in the installed build.

**M1 accepted** when the owner signs off the Mac cells (and Windows cells when Lane B finishes). Do not hold the Mac sign-off for Windows (O1).

## 4. Milestone V1 — work plan

Start V1 slices in parallel with Lane A once M0 is done; none needs the Mac launch. Each slice: Sonnet writes a short plan (files, tests, acceptance), Opus reviews high-risk ones, one implementer, independent review, owner merge.

| Slice | V1 cells | Work | Agent | Risk |
| --- | --- | --- | --- | --- |
| V-a Licenses | V14 | Generate the complete third-party license list at build time and return it from `getLicenses`; About shows it | ChatGPT (cloud) + Claude check run | low |
| V-b Audio profiles | V13, Must 11 | Implement Voice Isolation / Studio / Custom on the recognition copy only (original audio untouched); measurable effect test | Codex or Claude on the device; owner-approved plan first (audio path) | high |
| V-c Vocabulary learning stage 2 | V06, Must 4 | Resume the held stage 2 once the owner releases it | Claude | medium |
| V-d Summary recall | V10, Gate 6 | Diagnose the 13 missed items; prompt/chunking change; rerun the held-out eval (≤20 min or approval) | Claude Opus plan, Sonnet execution | medium |
| V-e Drift | V03, Gate 8 | Diagnose 65.8 ms drift (device-switch context); fix; one overnight rerun with approval | Codex on the Mac or Claude | high |
| V-f Live remote speakers | V04, Must 2 | Measure two-remote-speaker grouping on AMI fixtures; tune per #392 research | Claude | medium |
| V-g Retention and deletion | V12, Must 10 | Verify auto-delete options end-to-end on an installed build | ChatGPT tests + Claude QA | high (deletion) |
| V-h Exports | V11 | Six combinations, installed | Claude | low |
| V-i Privacy banner | V07, Must 5 | Verify per-recording banner and onboarding location | Claude | medium |
| V-j Import formats | V05 | Five formats on installed builds | Claude | low |

Then close Gates 4–8 in order with the evidence, and run the 14×2 V1 matrix on Mac and Windows installed builds from one `V1_RC_SHA` per OS.

## 5. Working rules for the planner

- One bounded task per session; name agent, computer, base SHA, files, tests, exclusions, and done-check.
- Run `npm run check` (or have it run) on every branch before review, including ChatGPT branches; prove a new test fails without its fix.
- Stop rule: second identical failure without new evidence → stop and report. No automatic reruns. Tests planned over 20 minutes need owner approval first.
- No new workflow, CI exception, contract change or controlling-plan rewrite without Opus review; contracts also need owner approval.
- Keep handoffs short: state, evidence links, next step. Don't restate history.
- Private recordings stay on the owner's computers; test data is AMI or invented.

## 6. Repo obfuscation options (O5)

The goal is that someone (or an agent) glancing at the repo does not immediately learn what the app is. Agents still need a functional description to work, so it moves below the fold rather than disappearing.

- **A (owner action):** keep the GitHub description neutral (it is currently "self-correcting scrib, local"; consider "scrb").
- **B (small PR):** add a root `README.md` that names only the codename and points contributors to `AGENTS.md`; change the first line of `AGENTS.md` from the product name to the codename; set the root `package.json` name from `meeting-scribe` to `scrb`.
- **C (larger PR, links change):** rename the four `dev-plan/Meeting Scribe - *.md` source documents to neutral names (e.g. `dev-plan/requirements-v1.2.md`) and update every link; neutral titles for new handoffs and gate files. The in-app product name is unchanged unless the owner asks.

## 7. Starter prompt for the planner session

```text
PASTE INTO: new Claude Code session · model Sonnet 5.5, effort medium · Mac (M5 MacBook Air) · folder ~/Documents/GitHub/scrb · admin: no

You are the primary planner for this repo. Read AGENTS.md, agents/agent_task_allocation.md, agents/agent-work-quality-record.md and dev-plan/m1-v1-path-forward-20261123.md (this plan). Check which owner decisions in §2 have been made (ask the owner for any still open, one question at a time). Then start Lane 0 and, in parallel, Lane A step M1.1. For each task you assign, give a self-contained prompt with a PASTE INTO header (session, model, PC, folder, admin yes/no). Send high-risk plans and any CI/contract/workflow change to the Opus overseer session for review before implementation. Keep plans lean and record one usage row per task.
```
