# SRCB Agent Task Allocation

**Updated:** November 8, 2026  
**Scope:** SRCB development. These owner preferences supplement repository instructions and approved plans; they do not override safety rules or authorize merges.

## Guiding rule

Maximize **useful, independently verified progress per scarce credit**, not the number of tasks or credits consumed. Select an agent based on task risk, hardware access, demonstrated quality, credit cost, remaining allowance, and existing assignments.

**Claude scarcity and context transfers (routing guidance, 2026-11-08):** Claude chat and Code share a scarce Pro allowance. For routine next-task/test selection and exact instructions, prefer ChatGPT Chat or the existing executor when either has verified context. Use Claude only when it adds enough value to justify the shared quota. Before transferring work between agents, sessions, models, or effort levels, weigh rereading context, cache misses, repeated diagnostics, and owner time. **Required independent review is never waived to save credits.** For Claude-specific model choices, follow [claude_model_split.md](claude_model_split.md); do not transfer or rerun work merely to compare costs.

## Historical credit and availability snapshot

Owner-reported figures **from November 1, 2026 only**, retained for history; the Claude trial/deadline and percentage figures below are not a current availability report. **Recheck before scheduling**.

| Resource | ChatGPT Chat | Claude Code | ChatGPT Codex |
| --- | --- | --- | --- |
| Five-hour allowance used | Effectively unrestricted for chat | 12% | 3% |
| Weekly allowance used | Effectively unrestricted for chat | 78% | 18% |
| Weekly allowance remaining | Not a practical constraint | 22% | 82% |
| Additional limit | Cloud-only work | Free trial ends **Nov. 3, 2026**, unless renewed | **Two** free discretionary limit resets |

The owner observes that **Codex uses roughly 2–4 times as many credits per task as Claude**, despite slightly lower quality at the model/effort settings currently selected. This is a practical observation, not a controlled benchmark. Codex has nevertheless been reliable at complex SRCB backend/native implementation. Claude's possible **$20/month** subscription is a separate owner decision; do not assume it will be purchased.

## Shared weekly quota authorization — owner decision, November 8, 2026

This expands the November 7 **Codex-only** permission to any agent using a finite included weekly allowance, including Claude Code and project-related Claude chat. Apply the limit to the **provider account/shared quota pool**, not independently per agent or session. Claude chat and Claude Code can consume the same Claude subscription quota; concurrent Windows/Mac Codex sessions can share a separate Codex quota. This grants no authority for paid usage.

**Default permission:** An otherwise authorized, in-scope task may use up to **99% cumulative weekly usage** (leave **at least 1% remaining**) without asking for additional spending approval. This is a ceiling, not a goal. Do not interrupt useful work solely because weekly usage is high or an intermediate checkpoint was reached. A rounded display and overlapping sessions make the last reported 1% unsafe to assume spendable: preserve a practical margin when the next action could exhaust the pool.

**Progress-based checkpoint:** For substantial tasks, declare a next verifiable milestone and a task-specific account-usage checkpoint before starting. If observed usage reaches that checkpoint without the milestone, briefly report work attempted, verified progress, account-level changes, and the next concrete in-scope step. Continue when justified; otherwise stop for owner direction. The checkpoint is **not** an automatic low-quota stop and never justifies repeated costly work without progress.

**Permission for 100%:** Before intentionally risking the final weekly allowance, ask the owner: "Permit [specific task] to use the remaining [provider] weekly allowance, potentially reaching 100% used? Permit / Deny." Only an explicit task-specific permit authorizes exhaustion; silence or a denial does not. Permission is not reusable by another task or session.

**Handoff before exhaustion:** For any task permitted to reach 100%, first save a durable handoff **before** credits reach zero: branch/commit or chat deliverable, changes, tests/evidence, outcome and blockers, next action, and observed five-hour/weekly readings. Prepare it early (normally at **5% weekly remaining**, or sooner if the next step could consume the rest). Even tasks stopping below 100% need an end-of-task status and usage row. Keep private recordings, transcripts, account identifiers, and secrets out of Git.

**Other limits:** Five-hour limits operate independently. This policy does not authorize paid credits/overages or auto-reload, subscriptions, quota resets, automatic test reruns, tests planned over 20 minutes without prior approval, private-evidence uploads, scope changes, bypassing independent review, or PR merges.

## Mandatory per-task usage tracker — owner decision, November 3, 2026

**Applies to every new assigned task**, including implementation, QA, documentation, diagnostics, work stopped early, and inconclusive work. Include project-related Claude chat planning/review alongside Claude Code work because they can draw from one Claude Pro pool; do not log unrelated personal conversation content, but flag known concurrent account usage. ChatGPT Chat and agents without a visible quota record `not applicable` or `unavailable`; never invent a quota.

**At task start**, before substantive work, record the date/time (America/Los_Angeles), agent/model and effort for the applicable task phase, device or surface, assignment ID, both **five-hour and weekly percentage remaining** readings, and each next reset time if visible. Prefer the agent's or owner's observed quota display and identify its source. Use `unavailable` when a value cannot be seen; do not block a safe task merely to obtain a reading.

**At task end**, including a blocker or failed attempt, record both remaining percentages again, observation time, **retry count**, **final acceptance** (`accepted`, `pending`, `failed`, or `inconclusive`), and evidence or PR link. For Opus-planning/Sonnet-execution or another hybrid, add only a short phase/model/effort breakdown tied to one task ID; detailed outcomes belong in the PR or handoff. Update the same row in this tracker using the permitted `rosmont/*` branch/PR process, not a direct push to `main`. If an edit awaits review, return a copy-ready row marked **not yet committed**.

Compute **observed consumption** as `start remaining - end remaining`, in **percentage points (pp)**, only if both readings belong to the same quota window. Record any five-hour/weekly reset, owner-initiated discretionary reset, overlapping sessions, or uncertain observation time; then report the difference as **not attributable / unavailable** instead of treating a reset as negative spending. Codex sessions, and Claude chat/Claude Code sessions within one subscription, can share a quota; displayed values can also round. These are **account-level changes, not isolated metered per-task costs**; do not sum overlapping deltas as if independently consumed. Do not label the difference as an exact agent usage rate. A percentage-point-per-hour rate requires reliable elapsed time and an uninterrupted quota window. Compare efficiency alongside task complexity, independent QA, delivered quality, retries and work completed; do not rank agents solely by percentages.

When a handoff or Claude model/effort switch occurs, note the reason and any *observed* extra setup, test repetition, or prompt-cache misses in the existing qualification column or linked handoff. A shared account percentage change is not a measured transfer cost; do not invent one or add mandatory tracker columns. Preserve all historical snapshots above without rewriting them. Do not commit account identifiers, screenshots, session content, private recordings, transcripts, or credentials. Do not make extra model calls just to refresh the display repeatedly.

### Per-task log

Metered-agent rows: include **phase / model / effort**, **retries**, **acceptance**, and reset/overlap notes. For nonmetered agents, use `not applicable` where appropriate. Claude model guidance: [claude_model_split.md](claude_model_split.md).

All times are Pacific (PT). `5h` and `week` are **percentage remaining**, not percentage used. The change column reports observed decreases where valid, **not proven exclusive costs**.

| Date (PT) | Agent / device | Task and outcome | Start time | End time | 5h left, start -> end | Week left, start -> end | Observed decrease, 5h / week (pp) | Phase / model / effort | Retries | Acceptance | Source, reset, overlap and qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-03 | Codex / Windows Dell | Gate 3 preserved-recording final-pass recovery **preparation**: GO; no run launched in this task | Not recorded | Not recorded | 78% -> 61% | 34% -> 32% | 17 / 2 | Not recorded | Not recorded | Not recorded | Agent-reported start/end balance; account-wide; possible concurrent usage; reset time and actual per-task attribution unknown |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: report-only measurement of 52 units plus six review fixes (commit da1d19b) | Not recorded | Not recorded | 79% -> 78% | 94% -> 94% | 1 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display. Independent review pending. 5h reset 2026-11-09 04:50 UTC. Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. Weekly resets 2026-11-13 13:00 UTC. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: owner-approved spread policy (25 ms onset, 100 ms offset), crop and annotation changes; assembly stopped on a 1.035 s short unit (commit 157cdc1) | Not recorded | Not recorded | 100% -> 97% | 94% -> 93% | 3 / 1 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | inconclusive | Source: Claude Code usage display. A 5h reset occurred between this and the previous row, so no cross-row delta. 5h reset 2026-11-09 09:50 UTC. Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. Weekly resets 2026-11-13 13:00 UTC. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: short-unit duration judged on speech span; assembly stopped at meeting 118.14 wpm (commit e87fdb4) | Not recorded | Not recorded | 97% -> 96% | 93% -> 93% | 1 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | inconclusive | Source: Claude Code usage display. Stopped on the wpm rule, not a code defect. Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. Weekly resets 2026-11-13 13:00 UTC. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: single-source speech rate and r2 pre-flight projection (commit 2949d86) | Not recorded | Not recorded | 95% -> 94% | 93% -> 93% | 1 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display. The 138.9 wpm meeting projection proved wrong (see A-026). Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. Weekly resets 2026-11-13 13:00 UTC. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: offline measurement of the owner's r2 render; meeting 127.93 wpm, assembly stopped | Not recorded | Not recorded | 94% -> 94% | 93% -> 93% | 0 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | failed | Source: Claude Code usage display. Offline files only; no render by the agent. Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. Weekly resets 2026-11-13 13:00 UTC. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: r3 pre-flight at meeting +20%; failed the 50% scenario, work stopped uncommitted | Not recorded | Not recorded | 92% -> 91% | 93% -> 93% | 1 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | failed | Source: Claude Code usage display. No commit from this task. Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. Weekly resets 2026-11-13 13:00 UTC. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: r3 pre-flight at meeting +30% plus pad-aware gap budget; all four scenarios pass (commit b7d91de) | Not recorded | Not recorded | 91% -> 90% | 92% -> 92% | 1 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display. Independent review by ChatGPT pending; no render requested. Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. Weekly resets 2026-11-13 13:00 UTC. |
| 2026-11-08 | Owner, Windows PowerShell (render-constructed-units.ps1); no agent | PR 74: owner-run r3 render of 52 constructed units (microphone default, meeting +30%) into renders-units-20261109-r3 | Not recorded | Not recorded | not applicable | not applicable | not applicable | Execution / owner-run / not applicable | 0 | pass (renders completed) | Source: owner PowerShell output. No Claude or Codex quota used by the render itself. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: offline measurement, assembly and joined verification of r3 (all 52 units accepted; verify-joined PASS both tracks; meeting 164.26 wpm, microphone 142.83 wpm). Per-task usage for the measurement itself was not recorded (omission) | Not recorded | Not recorded | unavailable | unavailable | unavailable | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display not read for this run. Annotations stay UNFROZEN; owner listening and independent review pending. Account-wide; Claude chat shares the pool. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: read-only r3 waveform spot-check (12 unit clips), index CSVs and listen-through checklist in derived-1\spotcheck; no thresholds changed | Not recorded | Not recorded | 86% -> 84% | 92% -> 92% | 2 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display (5h resets 2026-11-09 09:50 UTC; weekly 2026-11-13 13:00 UTC). Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | Session self-audit of own failures for the register (a4c539e, branch docs/agent-failure-register-all-agents, unpushed) | Not recorded | Not recorded | 83% -> 83% | 91% -> 91% | 0 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display. Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: ratified bands in amendment doc, draft r3 manifest (NOT_FROZEN), macOS CI diagnosis (Electron download HTTP 504, infrastructure), failure-register file | Not recorded | Not recorded | 80% -> 79% | 91% -> 91% | 1 / 0 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display (5h resets 2026-11-09 09:50 UTC). Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. |
| 2026-11-08 | Claude Code / Windows desktop (Code tab) | PR 74: listen-through sign-off saved and referenced in manifest; read-only D2 capture-path analysis at 553dd90; DRAFT D2 checklist and playback design (no test, no recording) | Not recorded | Not recorded | 78% -> 75% | 91% -> 90% | 3 / 1 | Execution / Sonnet 5.5 / effort unavailable to the agent | 0 | pending | Source: Claude Code usage display (5h resets 2026-11-09 09:50 UTC; weekly 2026-11-13 13:00 UTC). Account-wide; Claude chat shares the pool, overlap unknown; not an isolated per-task cost. |

## Assignment routing

### ChatGPT Chat — default for cloud-safe work

- Use for planning, documentation, GitHub reads/writes when authorized, focused source changes, regression tests, preliminary code review, integration preparation, and draft PR preparation.
- Use it for bounded backend fixes when the code and validation can be handled in the cloud; do **not** automatically delegate every coding task to Codex or Claude.
- Its work is **preliminary**: use a separate `rosmont/*` branch, report what was and was not tested, and require independent QA before merge.
- Chat cannot substitute for real Windows/macOS hardware, local recording permissions, confidential audio, or tools not actually available. **Stay in Chat**; never autonomously switch to ChatGPT Work.

### Claude Code — quality-sensitive work and independent Mac QA

- Prefer for independent code/plan review, targeted troubleshooting, UI implementation, physical Mac tests, and complex work when higher quality or lower per-task credit cost justifies it.
- Verify current Claude account access, model availability, five-hour and weekly remaining balances before scheduling; November 1 figures above are historical.
- Avoid duplicate reviews and long, low-yield investigations. Do not interrupt an active assignment to start optional work.
- If a designated reviewer is unavailable, report the review as pending; choose another reviewer only with owner authorization.
- When reviewing Claude's implementation, assign another agent to provide the independent approval.

### ChatGPT Codex — reliable native/backend implementation

- Prefer for complex recording/capture paths, Windows/macOS native changes, backend state and storage, transcription integration, and tasks requiring actual local build/test tooling.
- Use **Windows Codex on Windows** for Windows-native work and **Mac Codex on Mac** for macOS-native work. State the device explicitly.
- Its high reported **2–4× relative credit use** matters: reserve it for work where local execution, reliability, or implementation complexity makes that cost worthwhile.
- Use its normal five-hour and weekly allowances efficiently before considering either discretionary reset. Do not invoke a reset without the owner's decision.
- Do not assign overlapping native/backend edits to Codex and Claude/ChatGPT.

#### Codex orchestration and credit efficiency

- **One implementing agent by default.** Give each Codex session a bounded task. Avoid spawning internal subagents unless their independent parallel work has a clear benefit; directly managed Windows and Mac sessions remain separate.
- **Avoid wasteful polling.** Do not repeatedly invoke the parent model just to check long-running agent or terminal status (for example, frequent `wait_agent`, `list_agents`, or `write_stdin` calls). Prefer completion notifications or longer supported waits, checking again only when useful.
- **Checkpoint proportionately.** Define a concrete deliverable, targeted tests, and a safe commit/handoff point. If credits are consumed unusually quickly without corresponding progress, preserve work and investigate before continuing an open-ended orchestration loop.
- **Diagnose only when warranted.** For substantial unexplained quota drain, examine available local session telemetry for spawned agents, repeated waits or terminal polls, parent-model calls, and cached-input volume. Never commit private session content, secrets, or personal transcripts to Git.
- **Treat wait-timeout tuning as an optional experiment.** Longer `multi_agent_v2` waits (including a reported 25-minute configuration) are not a verified universal Codex Desktop fix. Verify installed-version and mode support, back up the original configuration, and test reversibly before adopting; do not mandate or silently change settings.

#### Codex failure diagnosis and correction

- **Confirm the requirement.** First check failures and anomalies against documented acceptance criteria and recording/data safety. Record harmless outliers without treating them as defects.
- **Diagnose independently.** Use relevant logs, source inspection, and the smallest useful reproduction to identify a confirmed in-scope failure. Separate permission is not needed just to investigate.
- **Fix low-risk issues in scope.** Correct straightforward setup errors or small defects within assigned files, add focused regression coverage, and preserve valid passing evidence.
- **Escalate high-risk changes.** Before changing native capture, durable recording/recovery, deletion, security/IPC, protected interfaces, or assignment scope, give the owner the likely cause, smallest proposed fix, safety impact, and test plan for approval.
- **Stop inconclusive loops.** If one focused diagnostic cycle finds no credible cause, report findings and uncertainties instead of broadening the investigation or repeating the same checks. A follow-up cycle needs a specific new assignment.
- **Limit repeat testing.** Do not automatically rerun passing broad suites, physical checks, or long acceptance tests. Document why repeats are needed; long reruns require owner approval.

## Decision order

1. **Can ChatGPT Chat complete the task safely in the cloud?** Assign it there first, with independent QA for any code changes.
2. **Is physical access required?** Choose the agent on the required operating system; reserve Claude's limited Mac time for independent testing and high-value review.
3. **Is substantial complex implementation required?** Prefer Codex where its demonstrated native/backend reliability matters. Choose Claude instead when expected quality and credits genuinely make it more efficient.
4. **Who independently verifies the result?** Planning-role proposals need at least one review round by another agent before owner approval. For code, run checks first, then independent review, then owner merge authorization. A model switch by the author does not count. Give the reviewer the branch/commit and acceptance evidence; avoid repeating QA without changes or new findings.
5. **Is another agent already working in this area?** Preserve that assignment. Parallelize only independent tasks and avoid simultaneous edits to the same state machine, shared interface, or file layout.

## Mandatory safeguards

- Follow SRCB's `AGENTS.md`, Development Process, approved phase/gate plan, and applicable `personal-dev-env` skills.
- Each assignment identifies **one agent, one device/environment, a goal, base commit, permitted files, acceptance tests, exclusions, and a separate branch/worktree**.
- Never push directly to `main`, merge a PR, alter protected shared interface definitions (`packages/contracts/`), or close/approve a gate without owner authorization.
- Risky audio, recording, recovery, correction, deletion, security, and IPC changes require a short owner-approved plan before implementation. Preserve independent recording safety ahead of AI features.
- Use approved `pde-gh-write` PR publication/merge controls. Never bypass approval safeguards with unguarded tools or alternate APIs.
- Keep plans, QA, comments, and patches **lean**. Fix demonstrated defects with focused behavioral tests. Do not add unrelated cleanup, speculative requirements, or repeated broad suites.
- Repair ordinary environment issues reasonably; if an optional tool remains blocked, finish unaffected work and report the minimum intervention needed rather than endlessly debugging setup.
- Protect confidential recordings and transcripts. Use invented or public fixtures; never place private audio, transcript content, voiceprints, or secrets in Git, logs, or reports.
- Run long physical tests (including four-hour recording tests) **in parallel with independent work** where practical, rather than making all development wait at the gate.
- Owner-disclosed real Teams calls may be used as **authorized testing opportunities** without asking the owner to authorize their use again. Keep testing nondisruptive and comply with applicable meeting-recording and privacy requirements.

## Scheduling checks before every new assignment

Confirm **current** credit consumption, reset windows, trial/subscription availability, active work, branch/PR/CI status, owner approvals, and outstanding dependencies. Do not reuse stale percentages or assume Claude will still be available after the free trial. Avoid new work when the most productive next step is to wait for a prerequisite or an agent's existing handoff.

A Phase 3 task that needs the native hardware and a physical test should not be displaced by optional V1.1 feature planning. Optional early reviews use leftover capacity only; V1.1 implementation is deferred until after Gate 8.
