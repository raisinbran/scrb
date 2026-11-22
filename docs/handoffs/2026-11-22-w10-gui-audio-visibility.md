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

## Incident reconciliation and prevention (follow-up to independent PR review)

The later Notepad restoration in this PR is **A-1071**. Earlier PR #415 already published a different A-1044 (unsupported GitHub workflow metadata reads). Its original incident is unchanged; both separate events remain documented. This PR's historical Notepad observations and the owner's unsaved document are unchanged.

The **separate task-control overrun is A-1072**. The authorized total task bound was 20 minutes, starting at 02:57:04 PT (nominal cutoff 03:17:04 PT); task end was 07:17:50 PT, **4h20m46s elapsed** and **4h00m46s over**. The reported Settings CUA query lasted **15,002 seconds (4h10m02s)**. Exact start/end times for that individual tool call, its internal stall cause, and any cancellation capability/attempt are **not recorded or verified**. The task-level time target did not provide a proven, independent way to interrupt a blocked tool call. No evidence establishes a Windows audio fault, administrator restriction, user-document access or SCRB defect.

**Execution prohibition:** Do **not** repeat CUA/getApp Settings or Calculator, launch another Notepad window, click/type through desktop automation, or probe whether the GUI tool recovered. Preserve the existing Notepad document without reading, editing, saving or closing it. Keep GUI interaction VISIBLE_ONLY; input/output endpoints and microphone privacy UI UNKNOWN; installed M1 and actual capture NOT VERIFIED.

**Evidence-based gate for any later GUI route:** First demonstrate a safe external cancellation/watchdog on a *synthetic, non-GUI* hanging fixture, with a <=60-second enforceable per-call limit and a <=20-minute total task limit including setup/teardown. The watchdog must remain active while the tool is blocked and must not terminate a user application or affect the user's session. Only after that safety proof, independent review and separate owner authorization may one short GUI operation be attempted. Log tool-call start/deadline/end, cancellation outcome and cleanup. Any timeout or inaccessible state stops the GUI lane without retry. If the interface cannot prove bounded cancellation, mark it CUA_UNAVAILABLE and use non-GUI checks.

**Available bounded non-GUI W10 work (separately authorized, no owner data):** run focused repository incident-ID validation (npm run check:register); existing synthetic installer-manifest and candidate-trust tests (scripts/win-installer-candidate-manifest.test.mjs and scripts/test-win-installer-candidate-trust.ps1); or read-only native/source SHA and package-closure checks on already present invented/public fixtures. These options do not demonstrate physical audio endpoint visibility or installed M1. Do not repeat a prior passing long inventory, install Scribe, create an account, run a GUI test or dispatch the hosted installer without separate permission.
