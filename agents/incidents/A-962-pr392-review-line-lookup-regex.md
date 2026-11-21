### A-962 — 2026-11-20 — Codex Desktop — PR #392 line lookup used invalid regular expression

- **What failed:** A read-only source-inspection script used a malformed regular expression and stopped at parse time before fetching or printing any file contents.
- **Impact:** No repository state changed; exact line lookup was delayed.
- **Correction / remaining risk:** Replaced the expression with literal substring matching and retrieved the relevant line numbers. Low.
