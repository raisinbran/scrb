# Handoff: SRCB PR #64 — owner decisions and strict UI review findings

**Prepared:** 2026-11-06
**Repository:** <https://github.com/raisinbran/scrb>
**PR:** <https://github.com/raisinbran/scrb/pull/64> (draft, unmerged)
**For:** Claude Code (UI owner), then owner merge decision

## 1. PR #64 state (as read from GitHub)

| Item | Value |
| --- | --- |
| Title | Port Mac focus fallback and 200% zoom fixes |
| Head | `6cfd0d3acdad32c8e4577994527dd050e07f1c4c` (3 commits: `bbc05f1`, `b871a81`, `6cfd0d3`) |
| Branch | `rosmont/phase8-mac-focus-zoom-port-20261106` |
| Base | `rosmont/gate3-integrated-candidate-20261102` at `2d1f8150cb68d56ec3fc842f1709f276f124ef55` (PR #42 branch, not `main`) |
| Size | 10 files, +234/−10 (244 changed lines), all UI or UI-test files |
| CI | Run `42331216488`: macOS PASS, Windows PASS on the final head |
| Prior review | ChatGPT review comment: PASS, non-blocking, not merge approval |
| Built by | Mac Codex (a UI task; under the rule below it should have been Claude's) |

An earlier Windows run on this PR hit two storage-test timeouts in code the PR did not touch. That is tracked under PR #58's Windows diagnosis, not here.

## 2. Owner decisions (2026-11-06)

1. **Ownership rule.** Claude manages UI tasks because its UI results are significantly better. Both Claude and Codex/ChatGPT may work on any non-UI task, with no exceptions.
2. **Definition of UI.** All front-facing aspects:
   - color scheme and themes, button placement, menu organization
   - every user interaction point
   - feedback to the user (for example "Final processing in progress..." status text)
   - the app launch experience (an easily found `.exe`, not a vaguely named buried `.bat`)
   - app optimization and responsiveness, partly, because a laggy app hurts the user experience
3. **Contract approval stays.** Changes to the shared UI/backend contract still need owner approval.
4. **Strict check of PR #64 by Claude.** Done in chat (section 3). A hands-on check at 200% zoom needs Claude Code.
5. **Issue #65 (boundary-check policy for `rosmont/*`):** close as "rule changed", with a comment pointing to the documentation follow-up in section 6. The old rule was folder- and branch-based, and the new rule is about what the user sees.

Working wording for the new rule, to be copied into the project documents:

> UI means everything the user sees, touches or waits on: visual design, layout, navigation, interaction and keyboard behavior, user-facing messages, the launch and install experience, and perceived responsiveness. Claude Code owns UI by default. Any agent may work on non-UI tasks. The shared contract still needs owner approval. When backend work changes what the user sees or reads, the user-facing part goes to Claude.

## 3. Strict review findings

**Scope of the review.** I read the full diff at `6cfd0d3` and the whole of `screens.test.tsx` on GitHub. I did not run the app or tests, and I did not see `LiveScreen.tsx` or `Screen.module.css`.

**Verdict.** No correctness bug found in the code I could read. I would not merge yet: finding 1 needs a reproduction attempt, and finding 2 leaves the main fix unverified.

### Finding 1 — the heading focus fallback might move focus when it should not (reproduce before changing)

**Revision note.** My first draft said the fallback could steal focus on Live while transcript text arrives. ChatGPT read commit `6cfd0d3` and reports that `LiveScreen.tsx` renders its own `<div>`, heading and `TranscriptView`, and does not use the shared `Screen` component or `useFocusFallback()`. If that is right, live transcript updates cannot trigger the hook, and the Live mechanism I described does not apply. I could not verify this myself (the file is not in the diff and GitHub blocked the fetch), so Claude Code should confirm it first. This finding is now conditional on reproduction.

- **Where:** `apps/desktop/src/ui/screens/Screen.tsx`, `useFocusFallback()`. It is also used by `LoadedDetail` in `recordings/MeetingDetailView.tsx`.
- **What it does:** the effect has no dependency list, so it runs after every render of the component that calls it. It focuses the heading whenever `document.activeElement === document.body`. That is also true after the user clicks blank space or a non-focusable word.
- **Remaining exposure:** screens that do use the hook and also update from backend events, mainly the meeting detail view (transcript, summary and meeting-status updates, including the new speaker-name `transcriptChanged` event from PR #58) and the other screens built on `Screen`. If focus is on the body when such an update re-renders the component, the heading takes focus. `focus()` also scrolls the heading into view by default, which can jump the page at 200% zoom.
- **Side note, out of scope:** because Live has its own heading and no fallback, focus falls to the body if a focused control disappears there. Record it for the Phase 8 accessibility pass.
- **Approach:** try to reproduce a real focus or scroll jump on the meeting detail view and one other hook-using screen. Click blank space so focus is on the body, then trigger a re-render with a backend update.
  - If it reproduces, fix the root cause: fall back only when the element that had focus was removed. Remember the last focused element and check whether it is no longer in the page. `focus({ preventScroll: true })` alone is acceptable only if the root-cause version is not feasible, with the reason stated.
  - If it does not reproduce, leave the hook unchanged and report the result. Do not rewrite it speculatively.
- **Separate acceptance test (keep):** the UI Specification requires "a selection survives 60 seconds of incoming live text". Add a Live test that selects a word with the mouse, advances live ticks, and asserts the selection and scroll position are unchanged. If the hook is not involved on Live, this will probably pass at once, which is fine. It is acceptance coverage, not proof of the hook's behavior.

### Finding 2 — the panel-collapse fix has no assertion

- **CSS added:** `min-height: 260px` on the transcript (`live/TranscriptView.module.css`) and `min-height: 200px` on `.panel` (`recordings/recordings.module.css`).
- **Gap:** `apps/desktop/e2e/focus-zoom.spec.ts` checks horizontal overflow, clipped controls and one keyboard-reachable button. Nothing asserts the panels keep their minimum height at 200%.
- **Add:** an assertion that the transcript container is at least about 200 CSS px tall at 200% zoom, in the Live recording state and the meeting detail state.
- **Design question for the owner:** at 200% zoom the viewport is about 640×338 CSS px. Header, controls, pickers and a 260px transcript cannot all fit, so the page scrolls vertically and Start/Pause/Stop may be off-screen. Playwright's `click()` scrolls automatically, so the test would pass anyway. Someone should look at Live at 200% by eye. If the recording controls are off-screen, decide whether they should stay pinned.

### Finding 3 — where focus goes after a dialog closes or an item is deleted (design choice, non-blocking)

After "Edit details" → Save, focus lands on the page heading, not back on the "Edit details" button. After deleting a vocabulary term it lands on the heading, not the next row. This is better than losing focus to the body. The common convention is to return focus to the control that opened the dialog, or to the nearest remaining item.

### Finding 4 — minor

- `focus-zoom.spec.ts` creates `scrb-focus-zoom-*` temp folders and never deletes them.
- The diff shows no focus-ring styling for the focused heading. The spec requires visible focus, so confirm a ring appears when the heading is focused from the keyboard.

### What is good

- The wrapping CSS is the right technique for narrow widths (`min-width: min(180px, 100%)`, `flex-wrap`).
- Tests cover a present control keeping focus, navigation focusing the heading, and deleting a term landing on the heading.
- The forced-overflow experiment (1532 vs ≤436) proved the overflow assertion can fail.
- The e2e test now logs effective window and viewport size, with a 1280 px width floor and 600 px height floor. The 600 px floor is a CI safeguard, not a product change.
- The diff stayed within the files it claimed.

## 4. Proposed assignment for Claude Code

### SRCB Claude Code: PR #64 focus-fallback check and layout verification

**Branch:** `rosmont/phase8-mac-focus-zoom-port-20261106`. Add new commits to PR #64; do not force-push or rewrite reviewed commits. The PR stays draft.

**Preflight:**

1. Read `AGENTS.md`, `CLAUDE.md`, `agents/agent_task_allocation.md` and `agents/agent_self_induced_failures.md`.
2. Confirm the PR head is still `6cfd0d3acdad32c8e4577994527dd050e07f1c4c`. If it differs, list the changed paths. Proceed only if every change is Markdown; otherwise stop and report.
3. Record fresh five-hour and weekly usage readings with timestamps, if your tool exposes them. Otherwise write `unavailable`.

**Required work:**

1. **Check finding 1 first.** Confirm whether `LiveScreen.tsx` uses `Screen` or `useFocusFallback()`. Then try to reproduce a focus or scroll jump caused by the hook on the meeting detail view and one other hook-using screen, as described in finding 1.
2. **Fix only if reproduced,** using the root-cause approach (focus only when the previously focused element was removed). If it does not reproduce, leave the hook unchanged and report what you tried.
3. **Add the Live selection-survival test** from finding 1 as acceptance coverage, and keep the existing focus tests passing.
4. **Add the panel minimum-height assertion** from finding 2 to `focus-zoom.spec.ts`. Keep the existing overflow and keyboard assertions unchanged.
5. **Report on the 200% Live layout** (finding 2's design question). Describe whether Start/Pause/Stop are visible without scrolling at 200% and 1280×720. Do not redesign without an owner decision.

**Allowed files:** the UI and UI-test files already in this PR, plus the matching test files. Keep the added diff small, roughly 100–150 lines including tests. Stop and ask above about 300.

**Do not change:**

- backend code (`apps/desktop/src/main/`, `packages/app-core/`, `packages/storage/`)
- `packages/contracts/`, native capture, SQLite schemas
- global color tokens, sidebar sizing, or control visual design
- anything on PR #58's branch
- findings 3 and 4, unless the owner decides otherwise

**Verification:**

1. Run targeted UI tests first, then `npm run check` and `npm run test:smoke`.
2. Run a short native Mac check at 1280×720 and 200% zoom: body-focused selection while live text arrives, focus after deleting a term, and Live controls reachable.
3. Target 10–15 minutes. Get owner approval before any test planned to exceed 20 minutes.
4. If the native app cannot be driven, report `NATIVE CHECK NOT PERFORMED`. Do not substitute a mock.

**Failure rules:**

- An obvious new type, lint or test error: make the smallest direct fix.
- An unchanged test failing: reproduce that one test on the PR's previous head before changing anything.
- A suspected flaky test: one recorded rerun only.
- Two targeted correction attempts per distinct failure, then stop and report.
- Windows storage-test timeouts that match the pattern already recorded on PR #58 are a baseline issue. Report them and do not chase them.

**GitHub writes:** use `pde-gh-write`. When approval is requested, capture the real request ID and give the owner the complete `pde-pr-approve <real-id>` command, the machine it is pending on, and the terminal steps (review in `less`, press `q`, type `yes` or `no`, press Enter). After approval, rerun the identical original command from the same directory to retrieve the result. Never approve your own request.

**Stop after:** both platforms' final-head CI is green and the handoff is written. Do not merge. Independent review comes after green CI, and the owner decides the merge.

**Report:**

- final commit SHAs and diff size
- the finding 1 reproduction attempt and result (reproduced or not)
- test commands with short output excerpts
- CI links for both platforms
- native check result and limits
- usage readings at start and finish
- copy-ready entries for the allocation and self-induced-failure logs (do not edit those files on this branch)

## 5. Order of work

1. Claude Code does the hardening above and pushes new commits to PR #64.
2. Wait for green macOS and Windows CI on the new head.
3. A short independent review of the incremental diff only.
4. Owner decides whether to merge PR #64 into the PR #42 branch.

## 6. Follow-ups and open items

| Item | Owner | Status |
| --- | --- | --- |
| Close Issue #65 as "rule changed", with a comment pointing here | Owner | Pending |
| Update the ownership rule in `AGENTS.md`, `CLAUDE.md`, the Development Process and the UI Specification so all four match section 2; decide the fate of the branch-check script | Owner to assign (can be a Claude or Codex documentation task) | Pending |
| Decide the 200% Live layout question (finding 2) and the focus-return convention (finding 3) | Owner | Pending |
| Add UI-ownership coverage for the launch experience (named `.exe`, icon, Start menu entry, no console window) to the Phase 8 plan | Owner to assign to Claude | Not started |
| PR #58: Windows diagnosis, green final-head CI, native open-transcript check, final review | Separate thread | Blocked; not part of PR #64 |
| P4-B must write verified model fingerprints, or P4-A matches only seeded test profiles | Owner | Confirm before merging PR #58 |

## 7. Limits of this handoff

- GitHub facts come from the PR pages as fetched on 2026-11-06. Recheck the head and CI before acting.
- Findings 1 and 2 are code-reading conclusions, not observed runtime failures. Finding 1 was revised after ChatGPT reported that `LiveScreen.tsx` does not use the shared hook. That report is unverified by me, so Claude Code confirms it first.
- No gate approval, merge approval or accessibility conformance (VoiceOver, WCAG) is implied.
