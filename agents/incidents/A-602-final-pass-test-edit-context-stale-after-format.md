### A-602 — 2026-11-15 — Codex / Mac desktop — focused test patch used pre-format context

- **Status / attribution:** Confirmed editing slip; no file change from the rejected patch.
- **What failed:** After formatting the new test file, I applied a follow-up patch using the old one-line `it.each` context. Patch verification rejected it because Prettier had expanded the table.
- **Impact:** One test edit attempt did not apply and required re-reading the current section. The existing test file and passing focused run remained intact.
- **Correction / remaining risk:** Reapplied against the formatted lines and added the omitted-setting and boolean-container cases. Low.
