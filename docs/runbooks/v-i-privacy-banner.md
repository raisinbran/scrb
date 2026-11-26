# V-i — Privacy banner and location (V07)

## Case matrix

Use a disposable library/profile and invented short meetings. The banner is determined by the saved location and the configured jurisdiction list. It can be dismissed for the current recording session and returns for the next recording.

| Case                                            | Saved location / action                                  | Expected result                                                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listed US state                                 | `US / IL` (also covered by `TX`, `WA`, `CA`, `CO`)       | Banner appears for each new recording.                                                                                                                                                                   |
| Unlisted US state                               | `US / NY` (also covered by `OR`, `AZ`)                   | Banner does not appear.                                                                                                                                                                                  |
| Listed non-US country                           | `DE` (also `GB`, `NO`)                                   | Banner appears for each new recording.                                                                                                                                                                   |
| Unlisted non-US country                         | `AU`                                                     | Banner does not appear.                                                                                                                                                                                  |
| Outside-US selection with OS location           | Saved `ZZ`, OS country `DE`                              | Banner appears because the OS country is listed.                                                                                                                                                         |
| Outside-US selection without a known OS country | Saved `ZZ`, OS country unavailable                       | Banner does not appear because no applicable location is known.                                                                                                                                          |
| Session dismissal                               | Listed location; dismiss while recording                 | Banner hides for that recording session. It is not a permanent opt-out.                                                                                                                                  |
| Next recording                                  | Start another recording with the same listed location    | Banner appears again.                                                                                                                                                                                    |
| First-launch onboarding                         | No saved location                                        | Required “Where are you based?” dialog is shown; it cannot be dismissed with Escape and Continue is disabled until a country/state is selected. Saving a choice updates settings and removes the dialog. |
| Reopen after saving                             | Relaunch with the same profile/library                   | Saved location is returned by setup status and the first-launch dialog stays closed.                                                                                                                     |
| Shared-library notice                           | Library folder is detected as shared; no dismissal saved | A non-modal status notice appears with a Dismiss button.                                                                                                                                                 |
| Dismissed shared-library notice                 | Dismiss, then reopen the same library                    | Notice remains hidden for that library. A different library can show its own notice.                                                                                                                     |

An import does not build voice profiles by default. If the user opts in for an import, the privacy rule should be applied using the same saved-location cases; do not infer an import banner from a recording-only result.

## Installed-build procedure

1. Use a fresh disposable packaged profile and a separate temporary library, with an explicit `library-location.json` pointer. Keep both outside the owner's profile and library.
2. Confirm the first-launch dialog appears before any location has been saved. Do not operate the dialog manually or through UI automation. For a controlled test, save an invented location through the test harness's `updateSettings` backend call, close the app, and relaunch the same profile.
3. Confirm `getSetupStatus.locationSet` is true, `getSettings.location` contains the saved choice, and the dialog is absent after relaunch. This checks one-time behavior without interacting with the dialog.
4. For each location row, save the fixture through the test harness, start a short test recording, check banner visibility, dismiss where specified, and start a second short recording to check return behavior. Use no real meeting audio or transcript.
5. To exercise the shared-library notice, use a disposable library whose folder-permission setup causes the backend to classify it as shared; dismiss it, close the app, and reopen the same library. Repeat with a second disposable library to check per-library storage.

Keep test recordings and diagnostics until gate disposition and owner-authorized cleanup. Any planned test including setup, recording, processing and cleanup expected to exceed 20 minutes requires owner approval before it starts.

## Acceptance record

For each platform and each matrix case, record `PASS`, `FAIL` or `NOT VERIFIED` with the evidence location. Identify the exact Scribe version, source commit, package filename, architecture, package SHA-256 and host OS version. Record the invented fixture identifier and hash, the isolated temporary profile/library used, and any relevant output/read-back checks. Keep installed results separate from unit-test and CI results. If no packaged candidate or platform evidence is available, mark installed acceptance `NOT VERIFIED`.

## Automated coverage without an installed build

- `packages/app-core/src/privacy.test.ts` checks listed/unlisted US states, listed countries, OS-country fallback and unknown location.
- `apps/desktop/src/ui/components/components.test.tsx` checks the required onboarding dialog, its disabled Continue state, saving, and its hidden state when a location is already saved.
- `apps/desktop/src/main/setup-status.test.ts` closes and reopens a library to verify that saved location is reported from disk.
- `apps/desktop/src/ui/screens/LiveScreen.test.tsx` verifies dismissal during one session and return on the next recording. `apps/desktop/src/ui/App.integration.test.tsx` checks banner presence across screens and session dismissal.
- `apps/desktop/src/ui/components/SharedLibraryNotice.test.tsx` and `apps/desktop/src/main/library-notice.test.ts` check dismissal persistence and per-library behavior.
- `apps/desktop/e2e/packaged.spec.ts` now includes a packaged-profile relaunch check. It inspects the dialog and uses the backend API to save the fixture, without operating the dialog.

## Evidence gap found and fix

Before this runbook change, `FirstLaunchLocation` and `getSetupStatus` unit tests separately covered saving and disk persistence, but the packaged test suite did not assert dialog absence after a full app relaunch. The existing packaged test pre-seeded the library pointer and only reloaded its page. This left fresh packaged-profile one-time behavior unverified. The minimal fix is an isolated packaged e2e case that observes the dialog on a fresh profile, saves a fixture through `updateSettings`, closes and relaunches the app, then checks the dialog is absent and the choice persisted; that case is now in `apps/desktop/e2e/packaged.spec.ts`.

The new packaged case is conditional on `SCRB_PACKAGED_APP` and has not been run in this task because no installed candidate was configured. The behavior is supported by the inspected code and storage-reopen tests, but installed-build evidence remains pending. Run the new case against a packaged candidate on the relevant host to close that evidence gap.
