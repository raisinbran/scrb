# BCHEN-W10 normal-user executor route — November 22, 2026

**Disposition: OWNER ACTION REQUIRED.** No Scribe installation, recording, native build, workflow dispatch, or M1 acceptance run was performed.

## Verified context

- The Windows host is **Windows 11 26H2, build 26300.9974**. Issue [#192](https://github.com/raisinbran/scrb/issues/192) and [incident A-350](https://github.com/raisinbran/scrb/blob/main/agents/incidents/A-350-windows-build-26300-mislabeled.md) establish this classification. The legacy registry `ProductName=Windows 10` is stale and does not establish Windows 10. Do not rerun `winver`.
- A visible GUI desktop is available in the active owner console session (session 2, `bchen`). The local Administrators group includes `LEAELLIOTT\bchen`; that owner desktop is therefore not an ordinary nonadministrator test session.
- The current command executor is `BCHEN-W10\CodexSandboxOffline`, a separate medium-integrity, nonadministrator identity. Its profile and token are not the owner desktop's. The restricted process cannot borrow the owner's GUI/profile/audio-device access.
- No active or separately authorized standard-user test account was identified. Read-only checks did not change accounts, ACLs, audio-capture permissions, installed applications, or settings. The sandbox profile's missing per-user microphone/audio-capture registry keys do not establish permission state for another account.

## Supported route and remaining prerequisite

Run the future acceptance executor **while signed in as an ordinary standard Windows user**, in that user's interactive desktop session and profile, with the intended microphone and meeting-audio devices visible to that session. A Codex Desktop or other owner-approved GUI/audio test executor must operate under that same standard-user token; a sandboxed shell attached to the administrator desktop is not a substitute.

**Smallest owner action:** designate an existing ordinary nonadministrator test account and start/attach the approved GUI/audio executor in that account's session. If no such account exists, explicitly authorize its provisioning and sign-in first. The agent must not create an account or change permissions without that authorization. Once authorized, the account owner can grant the required microphone permission and select/verify devices in that profile; no permission state for a future test account has been assumed here.

After this prerequisite, reviewed source/security changes, approved release identity, and separate owner permission for installation and M1 testing remain required. No private meeting or owner recording is part of this preparation.

## Preserved work

The earlier readiness report and draft [PR #426](https://github.com/raisinbran/scrb/pull/426) remain untouched. This addendum records only the corrected OS classification and executor finding; it does not replace their report or authorize installation.
