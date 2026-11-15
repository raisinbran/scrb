### A-522 — 2026-11-15 — Codex / Mac local — inline dependency audit had invalid escaping

- **Status / attribution:** Confirmed agent command error; no application defect.
- **What failed:** A nested-quoted inline Node audit had an invalid regular expression and exited before inspecting packaged dependencies. The preceding clean-PATH version launch and signature checks passed.
- **Agent-controlled cause:** I over-escaped the regular expression while nesting JavaScript inside shell quoting.
- **Correction / remaining risk:** Replaced the inline expression with a simpler `otool`-driven shell audit; all packaged tools and dylibs passed under `heavy.sh`. No files or packaged binaries were changed by the failed audit. Low.
