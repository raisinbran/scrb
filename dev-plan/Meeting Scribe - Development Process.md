# Meeting Scribe — Development Process

Oct 28, 2026

Author: BJC

## Scope

These tools govern how code is written and reviewed. None of them ships in the app or changes what it does.

| Tool | Source | Used for |
| --- | --- | --- |
| pde-comment-checker | [personal-dev-env/pde-comment-checker](https://github.com/henrico813/personal-dev-env/tree/main/pde-comment-checker) | Automated comment and naming checks on Go and Python files |
| pde-comment-review | [personal-dev-env/pde-comment-review](https://github.com/henrico813/personal-dev-env/tree/main/pde-comment-review) | Owner review of Go comments |
| skill-lessons | [personal-dev-env/skill-lessons](https://github.com/henrico813/personal-dev-env/tree/main/skill-lessons) | Saving repeated corrections to AI coding skills |
| Code-documentation skill | [personal-dev-env/ai/skills](https://github.com/henrico813/personal-dev-env/tree/main/ai/skills) | Comment rules for all languages |

- Phase 0 spikes are exempt from everything here. They are throwaway code in a scratch repository.
- Install and pin these tools in Phase 1, from one recorded commit of the parent repository.
- The likely app languages are TypeScript, Rust or C++, and Swift. The Go/Python checkers apply only if Go or Python files are added. Other languages use the shared documentation rules plus their normal linters.

## Per-slice workflow

Each slice of work is one small, testable change, settled in this order:

1. Record the full commit ID the slice starts from.
2. Decide whether the slice needs a written plan (next section).
3. Get the behavior and tests right.
4. Settle function, class and file names.
5. Write or adjust comments, only where they add a needed fact.
6. Run linters, type checks, tests and, where applicable, the comment checker.
7. Run comment review last, after the code has stopped changing.
8. Merge, and add the results to the phase's gate evidence.

## Risky-change plans

Any change that could lose recordings or data gets a short written plan first; routine UI and small fixes use an ordinary branch with the same tests. (Owner decision, 2026-10-30: this replaces the Planner tool, which was never installed.)

**Plan required for:** audio capture, chunk writing and recovery, pause/resume, file-format and index upgrades, correction precedence and frozen spans, deletion and auto-delete, security settings and IPC.

**Cycle**

1. Write `docs/plans/<topic>.md` in plain language: what changes, how it could lose data, and the test that proves each failure is handled.
2. The owner approves the plan before code is written.
3. Build on a branch, with a test for each failure the plan names.
4. Report test results against the plan; the owner approves the merge.

**Initial plans, in order:** capture contract and session clock; Windows capture adapter; macOS capture adapter; crash-safe chunks and recovery; pause/resume; transcript layers and frozen spans; vocabulary rules; index upgrades; delete and auto-delete. The chunk format and manifest (`chunks.json`, `transcript.final.json`) belong in the crash-safe chunks plan.

The secure shell, screens and exports usually go through ordinary branches unless a change touches IPC or security settings.

## Code documentation and comment review

A comment is added only when it states a needed fact the code, names and tests do not; no change is a valid outcome.

**Comments should explain:** side effects, failure order and partial results; state, ownership and ordering rules; defensive or compatibility branches; non-obvious units, limits and defaults; caller-visible behavior a signature hides; why a test matters when that is not obvious.

**Comments must not:** restate a name or a single line; use filler ("responsible for," "seamlessly"); claim guarantees the code and tests do not prove; describe a suspected bug as intended behavior.

**Naming (all languages):** new or renamed functions use at most seven words and start with a verb, except where language conventions differ (constructors, getters, test names).

**Go and Python only (if used):**

- Each `//` or `#` comment is at most two sentences, with no colon outside code or URLs.
- Every changed Python function, method and class has a docstring with a one-line summary. Test docstrings add a paragraph on why the behavior matters.
- Run `pde-comment-checker` on changed files with `--base` set to the slice's start commit; fix findings until it passes.
- Review Go comments with `pde-comment-review` after checks pass. Never hand-edit or commit `.code-comments.json`, and never change an owner-approved comment outside the review tool.

**Other languages:** follow the rules above, use the language's normal linter, and review comments as part of your own diff review.

## Skill-lessons

Lessons record a correction only when you explicitly ask the AI to remember it.

- A skill must opt in with its `## Lessons` section and marker; unmarked skills get no lessons.
- Scope each lesson to this project or a phase unless it is truly general.
- A repeated correction increments the existing lesson instead of adding a duplicate.
- Lessons are advice, not requirements, and never count as gate evidence.
- Review the store when a skill reaches 15 lessons.
- Promote a lesson into a skill's source only through a clean checkout and your review; retire it after the change is pushed.
- Never store meeting audio, transcript text, voice data, names from meetings or credentials in a lesson.

Likely opt-in skills: capture diagnostics, transcript changes, AI evaluation, export checks and release packaging.

## AI subagents

One coordinating agent owns shared contracts, the session state, file formats and every merge; subagents take bounded tasks only.

| Workstream | Useful in phases | Must not change |
| --- | --- | --- |
| Windows capture | 0, 2 | Session schema, macOS code |
| macOS capture | 0, 2 | Session schema, Windows code |
| Local AI (speech, speakers, summary) | 0, 3, 4, 6 | Recording code |
| Interface | 1–8 | Backend, contract or correction rules (Claude Code only; see Agent split) |
| Testing and release | Every gate | Quality targets |
| Export | 7 | The shared document layout |

Phase 0 is the best place for parallel work: the Windows probe, the Mac probe and the model benchmarks are independent.

**Handoff checklist for each subagent task**

- [ ] Goal and base commit
- [ ] Allowed files and folders
- [ ] Shared contracts it must not change
- [ ] Test fixtures and acceptance checks
- [ ] Known risks and exclusions
- [ ] Its own branch or worktree

The coordinator reviews, tests and merges one subagent result at a time. Two agents never edit the same state machine, schema or document layout at once.

## Agent split: Codex and Claude Code

Claude Code builds the interface; ChatGPT Codex builds everything else and skips all UI tasks.

> **User-specified decision.** This split was chosen by the project owner for this project. It is not a general practice. If these documents become the basis for another app, decide afresh whether to split work by agent and how.

**Ownership**

- **Claude Code:** the UI folder, the mock backend and UI tests, per the UI Specification document.
- **Codex:** capture, storage, AI workers, app core, exports and their tests.
- **You:** the contract folder. Either agent may propose a change through a handoff note; only you approve it.

**Instruction files (created in Phase 1)**

- `AGENTS.md` (read by Codex): do not create or modify files in the UI folder; skip UI tasks; write a handoff note when a backend change needs UI work.
- `CLAUDE.md` (read by Claude Code): build to the UI Specification; do not modify backend or contract files; write a handoff note when the UI needs something the contract lacks.
- Put the one-line ownership rule in both files, since each tool's file-reading behavior can change between versions.

**Enforcement**

- Claude Code works on `ui/*` branches; Codex works on all other branches.
- An automated check fails any `ui/*` branch that touches non-UI files, and any other branch that touches UI files. Contract changes fail both unless you mark them approved.

**Per-phase rhythm**

1. You approve the contract changes for the phase.
2. Claude Code updates the mock backend to match, then builds the screens.
3. Codex builds the backend against the same contract.
4. You merge both, switch the UI from mock to real backend, and run the gate.

**Handoff note template**

- [ ] From and to (Codex → Claude Code, or the reverse)
- [ ] What changed or is needed, in one or two sentences
- [ ] Contract items affected
- [ ] Screens or backend areas affected
- [ ] How to test it

Handoff notes live in `docs/handoffs/`, one file per note, and are closed when the receiving side merges.

## Borrowed code and licenses

Personal use lowers the stakes, but every borrowed file still needs a recorded source so it can be updated or replaced later.

- Pin the upstream repository and full commit ID.
- Record the source path, files copied or adapted, license, copyright notice and your changes in `THIRD_PARTY_NOTICES.md`.
- Check nearer license files, submodules, bundled binaries, fonts, icons and model weights separately. A top-level MIT license does not cover everything.
- Exclude Anarlog's `enterprise/` folder and anything under its commercial license.
- Record each model's source, version, license and checksum.
- Treat borrowed code like new code: same tests, linters and review.
- Wrap borrowed code behind project-owned interfaces so it can be swapped out.
- Closed-source apps (MacWhisper, Granola, Superwhisper) are design references only. Copy no code, text or assets.

## Maintenance and security updates

Dependencies are updated deliberately in the repository, never inside the running app.

- Enable Dependabot or Renovate on the repository to flag new versions and security advisories.
- Apply security fixes for the desktop shell, its built-in browser engine, audio libraries and AI runtimes within a month of release. Because the app is offline and loads no outside web pages, this risk is low, but not zero.
- Batch other updates into a maintenance release two to four times a year.
- Before any maintenance release: run the full test suite, a 4-hour recording on both machines, and the summary evaluation set.
- Model updates follow the same testing, then ship through the in-app **Check for model updates** option with rollback.
- Record what changed and why in the release notes and `THIRD_PARTY_NOTICES.md`.
- Recheck capture after every major Windows or macOS update, even when the app itself has not changed.

## Gate evidence

Each gate gets a short evidence note before you approve it. A passing build or demo alone is not enough.

- [ ] Build ID and commit
- [ ] Machines, OS versions, devices and meeting apps tested
- [ ] Models and settings used
- [ ] Automated test results
- [ ] Measurements against the Development Plan's quality targets
- [ ] Comment-checker results with base commit and file list (when Go or Python changed)
- [ ] Known limitations and open bugs
- [ ] Your decision, date and any follow-up
- [ ] User Manual sections updated for any behavior this phase added or changed
