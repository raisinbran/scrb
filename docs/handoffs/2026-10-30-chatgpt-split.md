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

## Stays with Claude Code

- Anything using real capture: the 4-hour Mac run, mic switch with a permission off, USB mic, real Teams or Zoom calls, Windows long run and load test.
- M2, forcing to disk, and any timing measured on a real machine.
- The real recording path through Electron, and the three-kill test on a real worker.
- Checking ChatGPT's work, merging and pushing.

## What ChatGPT must follow

- Work from `main` of the public repo `raisinbran/scrb`. Read `CLAUDE.md` first, then the source documents it lists.
- Never ask for or accept recordings, transcripts, names from real meetings, passwords or tokens. Test data is AMI fixtures or invented data.
- Do not change `packages/contracts/` without the owner's approval. UI code stays in `apps/desktop/src/ui/`, backend code stays outside it.
- Keep plans lean. Comments state a needed fact the code does not.
- One task at a time. Return a plan file, or a unified diff against a named `main` commit.
- Say what was not run. If `npm run check` was not run, say so; never report a test result that did not happen.

## How work comes back

Paste the result to Claude Code with the task number. Claude Code applies it on a branch, runs `npm run check`, reads the diff, and either merges it or lists exact fixes to paste back. Plans go to the owner for approval first.

## Prompt to start a ChatGPT task

```text
You are working on Meeting Scribe, a local desktop meeting recorder, in the public GitHub repo
raisinbran/scrb, branch main. Read CLAUDE.md and docs/handoffs/2026-10-30-chatgpt-split.md, and
follow the rules under "What ChatGPT must follow".

Your task is number <N> in that file's "Goes to ChatGPT" table.

First tell me whether you can read the repo. If you cannot, stop and ask me to paste the files you
need. Do not guess at code you have not read. Name the main commit you worked from, and list
anything you did not run or check.
```
