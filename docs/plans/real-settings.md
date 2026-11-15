# Real settings storage (Gate 1)

Status: **Approved by the owner on 2026-10-30 and built.**

## In short

Gate 1 asks that settings survive a restart. Today they live only in the mock, in browser storage. This plan saves them for real, in the library's `index.sqlite`, as the Requirements say, and leaves every other screen on the mock until its phase. It is planned because it changes IPC wiring and writes the index.

## What changes

1. **Main process:** at launch it opens the library and registers two real handlers, `getSettings` and `updateSettings`. The three existing security settings and the allowlists do not change.
2. **`packages/app-core`:** new settings handlers. They fill in defaults, merge a change into what is saved, and translate auto-delete values between the contract (`audioOnly`, `wholeMeeting`) and storage (`audio`, `meeting`).
3. **UI start-up:** in Electron, settings calls go to the real backend and all others stay on the mock. In a plain browser everything stays on the mock. The mock's own copy of the location is refreshed so the privacy banner follows the saved choice.
4. **Library location:** the existing saved location if there is one, otherwise a `Meeting Scribe` folder in Documents. The app creates this folder at first launch. No recordings go in it yet.
5. **Smoke test:** a new test saves a setting, restarts the app and checks it is still there.

No contract change. No file-format or index change: the `settings` table already exists.

## How it could lose data, and the test for each failure

| Failure | What happens | Test |
| --- | --- | --- |
| App closes during a save | The index is transactional, so the old or new value survives whole | Unit: kill between saves, reopen |
| Saved settings are unreadable | Defaults are used and the app still opens | Unit: damaged JSON |
| Bad auto-delete value | Falls back to Never, so a damaged setting can never delete anything | Existing storage test, plus a handler test |
| Index cannot be opened (locked or folder not writable) | The app still opens, the screens work on the mock, and a message box says changes will not be saved | Integration: read-only folder |
| Index is damaged | Storage's existing behaviour moves it aside, keeps the old file and rebuilds from the meeting folders, so meetings survive but saved settings go back to defaults. A message box says so | Integration: damaged index |
| Two copies of the app open | The second hands over to the first and quits | Integration |
| Settings patch merges badly | A nested change keeps its siblings | Unit: every nested group |
| Older saved settings lack a new key | The default fills it in | Unit |
| Renderer sends a bad request | Refused by the request validator before it reaches storage | Existing dispatch tests |

## Gate 1 evidence

On each of the Mac and the Windows PC, from a fresh clone: `npm ci`, launch, change settings, restart, confirm they survived, and run the security checklist. I can run the Mac here. The Windows PC needs a Claude session or you. Results go in `docs/gates/gate-1.md`. Electron's built-in `node:sqlite` was confirmed working on the Mac (Electron 45.1.0).

## Decisions for the owner

1. **What "clean install" means at Gate 1.** Recommendation: a fresh clone and `npm ci` on each machine. A real installer is Phase 8 work, so requiring one now would pull that forward.
2. **Mixed backend for now.** Recommendation: accept real settings with mock data elsewhere until each phase connects its screen. The app will still show sample meetings.
3. **Library folder.** Recommendation: `Documents/Meeting Scribe`, changeable later in Settings.
