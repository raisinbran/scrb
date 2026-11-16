### A-556 — 2026-11-15 — Codex / model unavailable / Mac local — broad policy search matched frozen usage rows

- **Status / attribution:** Confirmed command-scope error; no repository files were changed by the search.
- **What failed:** To find the guarded PR publication instructions, I ran a broad `rg` search across `agents/` for `pde-gh-write|usage-log`. This matched excerpts from the frozen legacy usage log, despite the repository instruction to read only its header.
- **Impact:** Selected legacy log rows appeared in tool output. No edits or external sharing resulted.
- **Correction / remaining risk:** Stopped searching that tree broadly; use exact skill/tool paths and read only the header when needed. Low.
