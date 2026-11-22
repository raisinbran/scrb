# BCHEN-W10 managed-desktop execution route — November 22, 2026

**Scope:** determine a policy-compliant future user-visible test route only. No Scribe install or launch, recording, media acquisition, account/security change, workflow dispatch, or M1 acceptance run occurred. Existing evidence and PRs #426/#429 remain unchanged.

## Decision

| Route/check | Status | Evidence and limit |
| --- | --- | --- |
| Existing `bchen` desktop, owner-assisted GUI | **AVAILABLE, provisionally** | The active console is session 2 for `bchen`; the desktop automation surface can see its existing app windows. The user presumes workplace policy permits a future non-elevated test profile and library in that desktop, excluding creation of a new Windows standard account. No Scribe process was launched, so app allowlisting and execution were not tested. |
| Codex command executor in `bchen` session | **BLOCKED** | The current executor reports `BCHEN-W10\CodexSandboxOffline`, interactive, session ID 2. It is a separate identity from `bchen`; sharing a session ID and desktop visibility do not grant its token or profile. No impersonation, `runas`, sandbox escape, or privilege change was attempted. |
| Microphone / meeting-audio access | **UNKNOWN** | A read-only audio-endpoint metadata query returned “Access to a CIM resource was not available to the client.” The inspected machine AppPrivacy policy path had no microphone/audio values. Neither observation establishes owner-profile permission, actual device visibility, or workplace approval. No capture was attempted. |
| New local standard account | **NOT PERMITTED by the current instruction** | The owner says not to create one and presumes existing-desktop testing is allowed. This does not satisfy a distinct acceptance requirement that specifically requires installation smoke under a standard-account token. |

## Practical route and limits

For future user-visible testing, the available route is an **owner-assisted, non-elevated GUI test in the existing `bchen` desktop**, with a disposable per-user app profile and library, if the Scribe build is permitted on the managed workstation and the owner verifies the intended audio devices and permissions in that session. The current Codex shell is not a valid executor for that route.

The owner’s policy response was: “I presume yes, except for creating a new Standard account on the OS itself.” This is recorded as an owner-reported presumption, not an independent IT policy attestation. If company policy or application controls deny the app or audio use, stop that path; do not seek a workaround. A standard-user installer smoke still needs an IT-approved standard-user host/account or a permitted alternate Windows host; the current desktop account is in Administrators.

## Preservation

Windows remains classified as **Windows 11 26H2, build 26300.9974**, per issue #192 and incident A-350; do not rerun `winver`. No prior report, PR #426, PR #429, recording, profile, permission, account, application, or security setting was changed.