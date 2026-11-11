# Handoff: SRCB decisions and findings, 2026-11-06 evening to 2026-11-07

**Prepared:** 2026-11-07
**Repository:** <https://github.com/raisinbran/scrb>
**Scope note:** I cannot see message timestamps. This covers everything since the PR #64 CI correction came back (Mac Codex run ending about 18:55 PT on 2026-11-06), which is the closest boundary I can identify to "since 11 PM PT". Earlier detail lives in `SRCB_PR64_Review_Handoff_2026-11-06.md` and the PR #58 handoff.

## 1. Where things stand

| Workstream | Status | Next gate |
| --- | --- | --- |
| PR #64 (focus fallback and 200% zoom port, draft) | Head `6cfd0d3`, 10 files, +234/−10. macOS and Windows CI green (run `42331216488`). Description corrected. ChatGPT review PASS recorded. My strict review found items to fix before merge. | Waits for Claude Code (decision 4 below) |
| PR #58 (P4-A voice-profile recognition, draft) | Head `111cb1e`. Notification correction reviewed. Windows CI failed twice on storage tests. Native Mac check not performed. | Windows diagnosis, then green CI, native check, review |
| Ownership policy documentation | Decisions made (section 2). Assignment for ChatGPT revised and ready. | Send assignment, then approve guarded writes |
| Issue #65 (boundary-check policy) | Open. Closure planned after the docs PR opens. | Owner authorization |
| P4-B plan, Phase 8 launcher task | Not started | See section 6 |

Merge status: nothing is approved for merge. No gate decision is implied.

## 2. Owner decisions

| # | Decision | Outcome |
| --- | --- | --- |
| 1 | UI definition wording | Approved, with responsiveness softened to "perceived responsiveness, where the user feels it" |
| 2 | Base branch for the docs change | `main` |
| 3 | Agent rules on the PR #42 branch | Must be propagated with conformance in mind, without breaking the project. Separate docs-only PR after the `main` one merges. |
| 4 | UI work while Claude Code is unavailable | UI work waits. No standing exception. Per-task written exceptions need the owner. |
| 5 | Performance responsibility | Approved: Claude owns the user-visible symptom and its acceptance test; either agent may fix the cause |
| 6 | Unclear-ownership procedure | Approved: record in `docs/handoffs/`, owner decides |
| 7 | Issue #65 | Close as "not planned" after the docs PR opens, with a comment |
| 8 | Phase 8 launcher/installer requirement | Separate task, tracked in a GitHub issue because the owner will lose a chat note |
| 9 | `scripts/check-boundaries.mjs` | Leave unchanged for now |
| — | Contract approval | Stays: shared contract changes need owner approval |

**Ownership rule as decided:** Claude manages UI because its UI results are significantly better. Claude, Codex and ChatGPT may all work on non-UI tasks with no exceptions. UI means everything the user sees, touches or waits on:

- color scheme and themes, button placement, menu organization
- every interaction point, including keyboard behavior
- user feedback such as status text ("Final processing in progress...")
- the launch experience (an easily found `.exe`, not a vaguely named buried `.bat`)
- perceived responsiveness, where the user feels it

## 3. Findings

### PR #64 strict review (by Claude in chat, from the GitHub diff only)

The full text is in `SRCB_PR64_Review_Handoff_2026-11-06.md`. Summary:

1. **Focus fallback (`Screen.tsx`, `useFocusFallback`).** It runs after every render of a component that uses it and focuses the heading whenever focus is on the page body. My first claim, that it could steal focus on Live as text arrives, was withdrawn: ChatGPT reports that `LiveScreen.tsx` does not use the hook. I could not verify that. The remaining exposure is screens that do use it and update from backend events, mainly the meeting detail view. The assignment is to reproduce first and change the hook only if reproduced.
2. **No assertion for the panel minimum-height fix** (`min-height: 260px` transcript, `200px` recordings panel). Also an open design question: at 200% zoom the controls may need vertical scrolling to reach Start/Pause/Stop.
3. **Focus after a dialog closes or an item is deleted** lands on the heading, not the invoking control or next row. Non-blocking design choice.
4. **Minor:** temp folders from the e2e test are never deleted; heading focus-ring styling is not visible in the diff.

### Windows storage-test failures (cross-PR pattern)

| Run | PR / head | Result |
| --- | --- | --- |
| `42176646918` | PR #42 parent `2d1f815` | PASS |
| `42273760514` | PR #58 `004c4773` | PASS |
| `42278482805` | PR #58 `111cb1e` | FAIL twice: first attempt two import-boundary tests, rerun four storage tests (`formats`, `index-db`, `library` x2) |
| `42330732540` | PR #64 intermediate | FAIL: two `library.test.ts` timeouts (lines 462 and 483) |
| `42331216488` | PR #64 `6cfd0d3` | PASS |

All failures are 5-second timeouts, with `EBUSY` or `ENOTEMPTY` cleanup errors on SQLite files. The failing cases differ between runs, but `library.test.ts` appears in both PRs' failures. The storage code is unchanged by either PR. Root cause is unknown. A leaked SQLite connection in test teardown is a lead, not a finding. ChatGPT added this evidence to PR #58 as a comment.

### Boundary checker

`scripts/check-boundaries.mjs` enforces only `ui/*` and `backend/*` branches and skips `rosmont/*`. **My earlier statement that this was a gap was wrong.** It is designed behavior, and the Development Process document describes stricter automatic enforcement than the script performs. The docs update must correct that.

### Branch divergence

`main` is `3538fd1926e0d9182698a69dc4791c14f590dc32`. PR #42's branch is `2d1f8150cb68d56ec3fc842f1709f276f124ef55`. `AGENTS.md` and `CLAUDE.md` differ; the Development Process and UI Specification are identical. `docs/gates/evidence-retention-policy.md` exists on `main` and is absent from PR #42's branch. PR #58 and PR #64 are built on that branch, so agents there read older rules.

## 4. Assignments ready to send

### A. ChatGPT: agent ownership policy alignment (docs only)

Send the ChatGPT-revised assignment (headed "SRCB — ChatGPT Assignment: Agent Ownership Policy Alignment") with these changes:

1. Add the "Owner decisions" block from section 2 above. It replaces the "proposed" labels in the assignment.
2. Claude in chat may do the independent review; Claude Code is unavailable.
3. Remove "Ambiguous or mixed-responsibility changes are resolved by the owner" from the main wording; it lives under decision 6.
4. Before writing the checker's behavior into the docs, quote the script lines that prove each statement.
5. Quote and correct the Development Process paragraph that says an automated check fails any `ui/*` branch touching non-UI files and any other branch touching UI files.
6. Draft the second, docs-only PR for PR #42's branch, but do not publish it until the `main` PR is merged.
7. Safeguards for that second PR:
   - copy byte-identical files from the merged `main` commit and record its SHA
   - list every path `AGENTS.md` and `CLAUDE.md` mention and confirm each exists on the target
   - diff in both directions and report lines that exist only on PR #42's branch
   - search for tests or scripts that read these files
   - stop and ask if a rule depends on a missing script or CI file
8. Draft a GitHub issue for the Phase 8 launcher and installer task: named `.exe`, icon, Start menu or Applications entry, no console window, discoverable launch. List it under "Follow-ups" in the docs PR description.
9. Interim rule in the docs PR description: agents on PR #42-based branches follow `main`'s `AGENTS.md` where it differs.

Do not modify the checker. Do not change PR #58 or PR #64.

### B. Windows Codex: PR #58 CI diagnosis

Send the final ChatGPT version ("SRCB — Windows Codex: PR #58 focused CI diagnosis") with four additions:

1. Include the PR #64 failure (run `42330732540`) alongside PR #58's.
2. Note whether the failing runs share a runner image version or a GitHub incident window.
3. Count only runs where the Windows job actually executed tests.
4. Answer from log timestamps first whether the `EBUSY`/`ENOTEMPTY` errors came before or after the timeouts.

Decide in advance what a clean history plus "not reproduced locally" means: one more CI attempt, or a closer look at the ten notification tests' resource use.

### C. Claude Code: PR #64 check and layout verification (blocked)

The assignment is in `SRCB_PR64_Review_Handoff_2026-11-06.md`, section 4. It waits for Claude Code to be available (decision 4). Use the revised file, not the first copy.

## 5. Recommended order

1. Send assignment A to ChatGPT. Approve its guarded writes (docs PR, launcher issue, Issue #65 comment) when they arrive.
2. Send assignment B to Windows Codex in parallel. The two are independent.
3. Merge the `main` docs PR after CI and independent review.
4. Publish the PR #42 propagation PR. Confirm CI green on both platforms and that only Markdown files changed.
5. Close Issue #65 as "not planned" once the docs PR is open and you authorize it.
6. PR #58: green Windows CI on the final head, then the native Mac open-transcript check, then final review.
7. PR #64: hardening and review when Claude Code is available, then your merge decision.

## 6. Open items

| Item | Owner | Note |
| --- | --- | --- |
| Launcher/installer issue (decision 8) | Created through assignment A | Do not let this drop; it is the only record |
| Update agent-rule documents on `main` and the PR #42 branch | Assignment A | Conformance-critical per decision 3 |
| 200% Live layout question (are Start/Pause/Stop reachable?) | Owner, after Claude Code inspects | Part of the PR #64 hardening task |
| Focus-return convention after dialogs and deletes | Owner | Non-blocking |
| P4-B must write verified model fingerprints, or P4-A matches only seeded test profiles | Owner | Confirm before merging PR #58; P4-B plan still to be drafted and reviewed |
| Heading-focus fallback and Live focus loss | Phase 8 accessibility pass | Recorded |

## 7. Unverified claims

I have not seen the repository directly. These come from ChatGPT or Codex reports and from GitHub pages fetched through chat:

- every CI run result and SHA
- `LiveScreen.tsx` not using the shared focus hook
- the branch comparison between `main` and PR #42
- the checker's behavior (read by ChatGPT; to be quoted in the docs task)
- PR #64's description update and review comment being published

Recheck heads and CI before acting on any of them.
