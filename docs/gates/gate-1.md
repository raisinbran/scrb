# Gate 1 Evidence

Status: **Mac done. Windows PC run still needed. Not yet submitted for owner approval.**

Gate 1: clean install, launch, restart and settings survive; the security checklist passes. "Clean install" means a fresh clone and `npm ci` on each machine (owner decision, 2026-10-30).

## Results

| Check | Mac (Apple M5) | Windows PC |
| --- | --- | --- |
| Fresh clone, `npm ci` | Pass at `9f780cb` | Not run |
| Type check, lint, unit tests | Pass: 572 passed, 24 skipped (need models) | Not run |
| Launch, all six screens | Pass | Not run |
| Settings survive a restart | Pass: saved in the real `index.sqlite` | Not run |
| Damaged index | Pass: moved aside, app opens with defaults | Not run |
| Library cannot open | Pass: app stays usable | Not run |
| Second copy | Pass: quits, first keeps working | Not run |

GitHub CI runs these same steps from a fresh checkout on `macos-latest` and `windows-latest`. It does not replace the run on the Windows PC.

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
- Worker tests are skipped on Windows, because the fake server is a Node script.
