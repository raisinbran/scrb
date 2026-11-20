### A-874 — 2026-11-19 — W10 — A3 usage correction patch did not match the local row

- **Status / attribution:** Confirmed patch-anchor error while updating the previous A3 accounting after the owner's later integrity confirmation; no files changed in the failed attempt.
- **What failed:** The patch expected different wording and surface details than the actual local usage row, so the patch tool rejected the update.
- **Impact:** One failed edit attempt; no published branch or PR state changed.
- **Correction / remaining risk:** Read the exact bounded row and applied the correction against its current text. Low.
- **Publication:** Local and unpublished in `agents/incidents/`; included in the W10 installer-smoke reporting PR branch.

