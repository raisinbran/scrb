# Work split: ChatGPT and Claude Code

**Owner decision, 2026-10-30:** work that needs no owner computer goes to ChatGPT, which has unlimited tokens. Work that needs a real Mac or Windows PC stays with Claude Code. Claude Code checks everything ChatGPT returns before it reaches `main`.

## Goes to ChatGPT

| # | Task | Done when |
| --- | --- | --- |
| 1 | Written plan for corrections | Plan in `docs/plans/`, owner approved |
| 2 | Written plan for vocabulary | Same |
| 3 | Written plan for index upgrades | Same |
| 4 | Written plan for delete, including recorded meetings and the cache | Same |
| 5 | Contract gap proposal, from the `*-contract-gaps.md` notes and `2026-10-30-final-pass-contract-gaps.md` | One proposal for the owner to approve. No code. |
| 6 | Tests for `recoverInterrupted` and for Start while the last recording is finishing, both in `apps/desktop/src/main/recording.ts` | Tests that fail if the fix is removed |
| 7 | Written proposal for a restart whose `open` ack says `ok: false` | Decision for the owner, then code |
| 8 | Windows restart changes from `2026-10-30-windows-capture-to-match-mac.md`, as a patch | Patch only. Claude Code builds and tests it on the PC. |

Tasks 1 to 7 are done. Task 8 waits for a build on the PC.

## Next tasks for ChatGPT, approved 2026-10-31

| # | Task | Done when |
| --- | --- | --- |
| 9 | Exact TypeScript for the contract items approved now, from `2026-10-30-owner-decisions.md` | A diff to `packages/contracts/` for the owner to approve, with `CALL_TABLE`, `EVENT_TABLE`, `REQUEST_CHECKS`, mock and allowlist changes |
| 10 | Corrections backend bridge, slices 2 and 4 of the corrections plan | Diff with tests. No contract change. |
| 11 | Delete: wire the `deleteMeeting` handler and rules 1 to 3 of the delete plan | Diff with tests. No contract change. |
| 12 | Index upgrades, Slice A | Diff with tests |
| 13 | Vocabulary, items 1 to 3 of the plan: learning, crash repair, term choices | Diff with tests |

Do these one at a time, in order. Before returning a diff, run `npm run check` if you can, and match the repo's lint and formatting. The last batch failed type check, lint and formatting.

Tasks 14 to 36, covering the rest of V1, are in `2026-10-31-chatgpt-remaining-work.md`.

## Stays with Claude Code

- Anything using real capture: the 4-hour Mac run, mic switch with a permission off, USB mic, real Teams or Zoom calls, Windows long run and load test.
- M2, forcing to disk, and any timing measured on a real machine.
- The real recording path through Electron, and the three-kill test on a real worker.
- Checking ChatGPT's work, merging and pushing.

## What ChatGPT must follow

- Work in the public repo `raisinbran/scrb`, on your existing branch, or a new one if that fits better. Never push to `main`. Read `CLAUDE.md` first, then the source documents it lists.
- A task assigned to you is approved: do not stop to wait for approval.
- Do not settle an outstanding decision or conflict yourself. Document it with your recommendation and leave it open for Claude Code.
- Never ask for or accept recordings, transcripts, names from real meetings, passwords or tokens. Test data is AMI fixtures or invented data.
- Do not change `packages/contracts/` without the owner's approval. UI code stays in `apps/desktop/src/ui/`, backend code stays outside it.
- Keep plans lean. Comments state a needed fact the code does not.
- One task at a time. Commit and push it to your branch, and name the branch and commit.
- Say what was not run. If `npm run check` was not run, say so; never report a test result that did not happen.

## How work comes back

Give Claude Code the task number, branch and commit. Claude Code runs `npm run check`, reads the diff, and either merges it or lists exact fixes. Claude Code makes the final decision on each open decision or conflict, with the owner if necessary.

## Prompt to start a ChatGPT task

```text
You are working on Meeting Scribe, a local desktop meeting recorder, in the public GitHub repo
raisinbran/scrb. Continue on your existing branch, or make a new one if that fits better. Read
CLAUDE.md and docs/handoffs/2026-10-30-chatgpt-split.md, and follow the rules under "What ChatGPT
must follow".

Your task is number <N> in that file's "Goes to ChatGPT" table.

This task is approved, so do not stop for approval. Document each outstanding decision or conflict
with your recommendation and leave it open for Claude Code to settle. Do not guess at code you have
not read. Commit and push to your branch, never to main. Name the branch and commit, and list
anything you did not run or check.
```
