# SRCB Agent Task Allocation

**Updated:** November 2, 2026  
**Scope:** SRCB development. These owner preferences supplement repository instructions and approved plans; they do not override safety rules or authorize merges.

## Guiding rule

Maximize **useful, independently verified progress per scarce credit**, not the number of tasks or credits consumed. Select an agent based on task risk, hardware access, demonstrated quality, credit cost, remaining allowance, and existing assignments.

## Credit and availability snapshot

Two separate **owner-reported** snapshots from November 2, 2026 (America/Los_Angeles). Times below indicate **when each report was documented or verified**, not the precise time the owner checked the quota screen. These are historical observations, **not live usage telemetry**; recheck before scheduling.

| Report (PT) | Agent | 5-hour remaining | 5-hour used | Weekly remaining | Weekly used |
| --- | --- | ---: | ---: | ---: | ---: |
| **Earlier Nov. 2** — documented **12:54 AM** | Claude Code | **100%** (just refreshed) | 0% | **15%** | 85% |
| **Earlier Nov. 2** — documented **12:54 AM** | ChatGPT Codex | **34%** | 66% | **80%** | 20% |
| **Later Nov. 2** — documented **2:31 AM** | Claude Code | **77%** | 23% | **12%** | 88% |
| **Later Nov. 2** — documented **2:31 AM** | ChatGPT Codex | **14%** | 86% | **77%** | 23% |

ChatGPT Chat remains effectively unrestricted for cloud-only work in both snapshots. Claude's reported free trial ends **Nov. 3, 2026** unless renewed; Codex has **two** free discretionary limit resets, each requiring owner authorization. The later figures supersede the earlier figures **for current scheduling only**; retain both snapshots for the historical record.

**Cost lesson (owner estimate, Nov. 2):** The earlier description that Windows FFmpeg troubleshooting consumed *almost half* of Codex's five-hour allowance was an exaggeration and is superseded. At least two failed runs showed almost the same error; the owner estimates **roughly 12% of the five-hour allowance per run**, not a measured total. The Windows FFmpeg build subsequently passed on a GitHub-hosted Windows runner with MSYS2. Prefer ChatGPT Chat plus hosted CI for reproducible Windows build/test tasks; do not spend scarce local-agent credits repeating environment setup. Escalate repeated, similar failures promptly to targeted independent diagnosis rather than continuing speculative fixes.

The owner observes that **Codex uses roughly 2–4 times as many credits per task as Claude**, despite slightly lower quality at the model/effort settings currently selected. This is a practical observation, not a controlled benchmark. Codex has nevertheless been reliable at complex SRCB backend/native implementation. Claude's possible **$20/month** subscription is a separate owner decision; do not assume it will be purchased.

## Assignment routing

### ChatGPT Chat — default for cloud-safe work

- Use for planning, documentation, GitHub reads/writes when authorized, focused source changes, regression tests, preliminary code review, integration preparation, and draft PR preparation.
- Use it for bounded backend fixes when the code and validation can be handled in the cloud; do **not** automatically delegate every coding task to Codex or Claude.
- Treat GitHub-hosted Windows runners, including MSYS2/UCRT64, as ChatGPT Chat cloud execution capacity for reproducible builds, dependency checks and regression tests. CI does **not** replace physical microphones, device-specific capture, permission testing or actual installed-app acceptance.
- Its work is **preliminary**: use a separate `rosmont/*` branch, report what was and was not tested, and require independent QA before merge.
- Chat cannot substitute for real Windows/macOS hardware, local recording permissions, confidential audio, or tools not actually available. **Stay in Chat**; never autonomously switch to ChatGPT Work.

### Claude Code — quality-sensitive work and independent Mac QA

- Prefer for independent code/plan review, targeted troubleshooting, UI implementation, physical Mac tests, and complex work when higher quality or lower per-task credit cost justifies it.
- In the latest reported snapshot, Claude had **77% of its five-hour** but only **12% of its weekly** allowance remaining; the **Nov. 3** trial deadline still favors critical Phase 3 diagnosis, QA and physical verification over routine tasks.
- Avoid duplicate reviews and long, low-yield investigations. Do not interrupt an active assignment to start optional work.
- Do not schedule Claude-only tasks after Nov. 3 without confirmed access. Future independent QA may be assigned to another available agent.
- When reviewing Claude's implementation, assign another agent to provide the independent approval.

### ChatGPT Codex — reliable native/backend implementation

- Prefer for complex recording/capture paths, Windows/macOS native changes, backend state and storage, transcription integration, and tasks requiring actual local build/test tooling.
- Use **Windows Codex on Windows** for Windows-native work and **Mac Codex on Mac** for macOS-native work. State the device explicitly.
- Its high reported **2–4× relative credit use** and latest **14% remaining five-hour allowance** matter: reserve it for work where real local execution, reliability, or implementation complexity makes that cost worthwhile. Avoid Windows FFmpeg/toolchain setup already resolved in hosted CI.
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

1. **Can ChatGPT Chat complete the task safely in the cloud, including GitHub-hosted Windows/MSYS2?** Assign it there first, with independent QA for any code changes.
2. **Is physical access required?** Choose the agent on the required operating system; reserve Claude's limited Mac time for independent testing and high-value review.
3. **Is substantial complex implementation required?** Prefer Codex where its demonstrated native/backend reliability matters. Choose Claude instead when expected quality and credits genuinely make it more efficient.
4. **Who independently verifies the result?** Use a different agent; give the reviewer the exact branch/commit and acceptance evidence. Avoid repeating QA already passed without code changes or new findings.
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
