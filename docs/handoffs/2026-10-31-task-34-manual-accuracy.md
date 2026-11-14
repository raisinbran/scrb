# Task 8 / Task 34 — source-based manual accuracy audit

**Audited:** `main` `088b61a`; original V1 manual draft on draft PR #8 `93b713d`. This separate documentation branch was created from `main`, not the unmerged PR #8.

## Corrections

| Original implication | Evidence from audited sources | Revised treatment |
| --- | --- | --- |
| Installed app and model setup already work | Desktop build creates Vite and Electron JS; `openBackend` disables unbundled capture/final-pass in packaged mode | Flag install/first launch as planned |
| Live capture and transcript are ready for meetings | Helper must be explicitly configured; low-latency native feed remains missing on PR #8 | Label mock vs developer-only vs real model flow |
| Import, summary, DOCX/PDF and full speaker workflows are operational | `main` handlers are incomplete; PR #8 adds preliminary implementations awaiting QA | Mark as partial/planned |
| Timestamp buttons play real saved audio | Task 19 security/transport plan still needs approval | Explicitly say real playback is unavailable |
| Models can download, update and revert | Model Settings UI exists, real pinned manifest / production installer absent | Explain that model controls are prototype/UI |
| Offline behavior and notices are established | No full installed egress test or exact bundled license notices | Preserve these as release requirements |
| User manual advertises mock-only shortcut | Actual shortcut implementation is in `use-live-shortcuts.ts`; F1 Help is available | Remove mock-only shortcut and list real keys |

**Method:** source comparison only. No native OS, hardware, installer, real model, real PDF export, full security review, or screen-reader test was performed. Preserve V1 intent; do not present preliminary work as released functionality.

**Merge note:** PR #8 already adds an earlier version at the same manual path. Claude Code must reconcile the edited manual with that PR when it merges, rather than choosing one copy blindly. No changes were made to PR #8.
