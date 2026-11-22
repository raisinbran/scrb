# BCHEN-W10 GUI and audio visibility check — November 22, 2026

**Disposition:** `VISIBLE_ONLY`. Desktop window inventory was visible; actual mouse/keyboard control was not confirmed. Windows Sound and microphone settings could not be inspected. No Scribe app was launched or installed; no audio was captured.

## Required status fields

| Field | Result | Evidence |
|---|---|---|
| `GUI_VISIBLE` | YES | CUA desktop inventory returned the active session's native app windows. `query user` showed `bchen` console session 2 active and idle more than six days at observation. |
| `GUI_INTERACTION` | `VISIBLE_ONLY` | Notepad launch unexpectedly restored an existing unsaved user document. It was not read, edited, saved, or closed. To preserve it, no input was sent. `getApp` then returned “Accessibility state unavailable” for Calculator and Settings. After the documented CUA reset and fresh app inventory/selection, Settings state capture still failed. No click or keyboard interaction was demonstrated. |
| `INPUT_ENDPOINTS_VISIBLE` | `UNKNOWN` | Settings > System > Sound could not be inspected because the Settings window did not expose accessibility state. A separate sandbox CIM query was access-denied and does not establish owner-session device availability. |
| `OUTPUT_ENDPOINTS_VISIBLE` | `UNKNOWN` | Same Settings UI limitation; no output endpoint state was observed. |
| `MIC_PRIVACY_UI_VISIBLE` | `UNKNOWN` | Settings > Privacy & security > Microphone could not be inspected; no permission was changed or read from another user's profile. |
| `CODEX_SHELL_USER` | `BCHEN-W10\CodexSandboxOffline` | Previously verified executor identity remains separate from `bchen`, even though both use session ID 2. No impersonation, `runas`, privilege workaround, or account change. |
| `ACTUAL_CAPTURE_NOT_TESTED` | YES | No Scribe launch, recording, or audio acquisition. |

## Interpretation

This check did **not** establish a technical limitation in Windows audio devices or corporate policy. The specific blocker is the current GUI tool's inability to provide accessible state for the Settings and Calculator windows. Desktop inventory visibility alone cannot prove mouse/keyboard control. Owner physical GUI control in this session remains untested.

An installed M1 test still requires a separately reviewed and owner-authorized candidate and test budget. Keep the hosted standard-user NSIS smoke as a separate lane. Windows remains classified as Windows 11 26H2, build 26300.9974, per issue #192 / incident A-350; no OS or toolchain checks were repeated.
