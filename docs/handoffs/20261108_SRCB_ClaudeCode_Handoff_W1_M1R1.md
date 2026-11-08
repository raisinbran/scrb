# SRCB: Claude Code handoff — Tasks W1 and M1/R1

**Date:** 2026-11-08 (PT) · **From:** SRCB master planning session (Sonnet 5.5) · **To:** Claude Code, **Opus 5.5, Medium effort**, Mac
**Status:** Plan independently QA'd by ChatGPT (conditional approval); its corrections are applied below. This handoff authorizes **only** the two tasks below. It does not authorize merges, physical tests, gate approval, or PR B.

## How to run this

1. Open Claude Code in the `scrb` folder. Model: Opus 5.5, effort Medium.
2. Run **W1 first**, in its own session. When it is finished and reported, start **M1/R1** in a **new** session. Do not run both at once: they are independent in code, but running them together puts two sessions on the same 5-hour quota window and doubles what you must supervise.
3. Paste: `Read docs/handoffs/20261108_SRCB_ClaudeCode_Handoff_W1_M1R1.md. Execute Task W1 only.` (later: `... Execute Task M1/R1 only.`)
4. Neither task may be reviewed by the agent that built it. Independent review (Claude chat by default, or Codex after its quota resets, verify the reset time rather than assuming ~5pm PT) is a separate step after each.

## Rules that apply to both tasks

- **Policy files:** read `AGENTS.md`, `agents/agent_task_allocation.md` and `agents/agent_self_induced_failures.md` **read-only from current `origin/main`**. Branches stacked on PR #42 (including PR #67) predate these files, so they may be absent from your working branch. Apply the rules in them; do not add or modify those files on your task branch.
- **Usage log (mandatory):** at start and end, record date/time (PT), agent/model, device, and your visible **5-hour and weekly remaining %**. Never guess; write `unavailable` if you cannot see it. Put a proposed tracker row in your final handoff; do not edit the tracker on your task branch.
- **Branches/PRs:** use `rosmont/*`. Never push to `main`. Open **draft** PRs only. Do not merge anything. Do not touch `packages/contracts/`.
- **Tests:** targeted before broad. No test expected to exceed 20 minutes. Do not rerun failed or inconclusive runs repeatedly. No physical or recording tests.
- **Privacy/evidence:** never read, use or commit the owner's real recordings, transcripts or voiceprints. Use AMI fixtures or invented data. Do not delete evidence.
- **Keep it lean:** no unrelated cleanup, no speculative scope, no verbose GitHub comments.
- If you make a demonstrable mistake (wrong command, false failure, unneeded retry), note it in your handoff so it can be logged in `agents/agent_self_induced_failures.md`.

---

## Task W1 — fix the PR #67 analyzer edge case (source-only)

**Agent/device:** Claude Code, Mac. **Base:** PR #67 head `1905e729` (read the branch name off the PR). **Branch:** new `rosmont/*` branch cut from it. **Draft PR target:** the PR #67 branch, not `main`.

**Read first:** `docs/handoffs/gate3-upstream-diagnostics-pr-a.md` on PR #67, then `packages/transcription/src/liveTraceAnalysis.ts` and its tests.

**Defect:** a complete-looking supervisor/worker trace pair with **zero processing-stage observations** (no VAD or model-processing observations) can produce `unknown: false`. Independent review confirmed this on PR #67.

**Required behavior:** "no analyzable processing" must report **UNKNOWN/INCONCLUSIVE** and must **not** allege a cause.

**Permitted files:** the trace analyzer and its test file only.
**Exclusions:** capture, contracts, storage, UI, recognition thresholds, transcription behavior, frozen Gate 3 results, PR B (sink/persistence/publication tracing), private recordings, any physical test.

**Steps**
1. Write a failing regression for the exact case (complete supervisor + worker traces, zero analyzable processing). Confirm it fails for the right reason.
2. Make the minimal analyzer correction.
3. Run the focused tests, then `npm run check`.
4. Push the branch and open a **draft PR targeting the PR #67 branch**.
5. Report Windows and macOS CI results on the new head.

**Stop and report instead of continuing if:** the fix needs any file beyond the analyzer and its tests; it exceeds roughly 300 changed lines; or Windows CI shows the known `EBUSY` storage-timeout signature. In that case report it and do not fix it here (that is M1/R1).

**Done means:** regression added and passing, focused checks and `npm run check` pass, draft PR open, CI result reported, quota readings and tracker row included. Note in the handoff that independent targeted confirmation and an owner merge decision are still required.

---

## Task M1/R1 — diagnose the recurring Windows CI storage-test failure

**Agent/device:** Claude Code, Mac (CI logs via `gh`; no Windows device this session). **Start only after W1 is reported.**
**Base:** current `origin/main`. **Mode:** diagnosis first. Change code only if the cause and fix are demonstrated.

**Symptom:** on the Windows job only, unchanged storage tests (format validation, index migration, and library crash/correction cases) time out at 5 s with SQLite `EBUSY` cleanup errors. macOS always passes.
- `main` after PR #66 (Markdown-only change): [run 42448516572](https://github.com/raisinbran/scrb/actions/runs/42448516572)
- PR #58 final head: [run 42278482805](https://github.com/raisinbran/scrb/actions/runs/42278482805), attempts 1 and 2 (attempt 1 failed different import-boundary cases; PR #58 logs also show an `ENOTEMPTY` cleanup error)
- PR #64 intermediate runs
- Current `main` (`e46d6e5`) and PR #67 pass Windows CI, which suggests an **intermittent or environment-sensitive** failure. A green run does not prove a fix.

**Do**
1. Pull the failing and passing Windows logs for these runs. List which tests fail, in what order, and what runs concurrently.
2. Read the failing tests and the storage code's SQLite connection open/close and temp-directory teardown.
3. **For each failing test, find the first error in time.** A 5 s timeout, `EBUSY` and `ENOTEMPTY` during cleanup may be consequences of a test that already timed out, not independent causes. Report which came first and what that test was waiting on.
4. Check for: unclosed handles, a missing `await` on close, shared temp dirs, vitest parallelism or pool settings, runner contention.
5. State the most likely cause with evidence, and what experiment would confirm it.

**Do NOT:** raise timeouts, mark tests flaky, rerun broad suites repeatedly, or infer a common cause from overlapping signatures alone (overlap does not prove a shared root cause or that the failures are unrelated). Do not blame the Markdown-only PR #66.

**If a fix is demonstrated and small and lives in test code** (teardown/close ordering): branch off `main`, add a focused regression, run `npm run check`, open a **draft PR against `main`**, and report both-platform CI.
**If it requires changing storage runtime code, stop.** That is a risky change. Give the owner a short written plan (likely cause, smallest fix, data-safety impact, test plan) and wait for approval.

**Done means:** a written diagnosis with evidence and confidence level, either a demonstrated small fix PR or a confirming-experiment proposal, CI links, quota readings, tracker row.

---

## Not in scope for these sessions

- **M2** (native Mac verification of PR #58): waits for a green #58 and likely Codex on Mac.
- **M3** (PR #64 UI review): needs owner assignment of Claude Code and the revised review handoff.
- **R2** is already prepared as local branch `rosmont/agent-policy-propagation-20261108` (two docs-only commits on PR #42's head, not pushed). Do not alter it.
- **PR B, P4-B/P4-C, Gate decisions:** not authorized.
