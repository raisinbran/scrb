# Gate 1 Evidence

Status: **Done on both machines. Awaiting owner approval.**

Gate 1: clean install, launch, restart and settings survive; the security checklist passes. "Clean install" means a fresh clone and `npm ci` on each machine (owner decision, 2026-10-30).

## Results

| Check | Mac (Apple M5) | Windows PC |
| --- | --- | --- |
| Fresh clone, `npm ci` | Pass at `9f780cb` | Pass at `7082658`, 45 s |
| Type check, lint, unit tests | Pass: 572 passed, 24 skipped (need models) | Pass: 562 passed, 34 skipped |
| Launch, all six screens | Pass | Pass |
| Settings survive a restart | Pass: saved in the real `index.sqlite` | Pass |
| Damaged index | Pass: moved aside, app opens with defaults | Pass |
| Library cannot open | Pass: app stays usable | Pass |
| Second copy | Pass: quits, first keeps working | Pass |

GitHub CI also passed these steps from a fresh checkout at `7082658` on `macos-latest` and `windows-latest`, using the exact locked dependencies.

**Windows PC caveats.** `npm audit fix --force` was run in that clone between install and tests, so the run used newer test tools than the lockfile, not the exact locked set. The CI run covers the locked set. The same tool updates were then made in the repo. The run also used an administrator PowerShell inside `C:\Windows\System32`; the app needs no administrator rights, and running that way can hide permission problems, so normal-user Windows behaviour rests on CI.

## Security checklist

Checked by the smoke test on every run, except where noted:

- Context isolation on, sandbox on, node integration off.
- No `require` or `process` in the page; the bridge exposes only `invoke`, `platform` and `subscribe`.
- Script policy is `script-src 'self'`; the page loads from the `scribe:` scheme.
- Unknown call names are refused. Requests are validated in the main process (`dispatch.test.ts`).
- By code review, not by the smoke test: navigation is blocked, new windows are denied and all permissions are denied (`apps/desktop/src/main/security.ts`).

## Limits of this evidence

- Only settings are real. Every other screen runs on the mock until its phase.
- "Closing during a save" has no test of its own; it relies on SQLite committing each write whole.
- The message boxes for a damaged index and a failed library were not checked by eye.
- 10 more tests skip on Windows than on the Mac: 7 summary worker tests, because the fake server is a Node script, and 3 in `library.test.ts`.
