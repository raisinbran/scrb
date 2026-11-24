### A-1121 — 2026-11-23 — Claude Code (Opus 5.5) — review-session command errors, missed start reading and a wrong finding

- **Agent:** Claude (Claude Code, Opus 5.5, Mac desktop app)
- **Status:** confirmed, self-reported; corrected in the same session.
- **What happened:** (1) three shell commands used unquoted `--include=*.ts` / glob patterns that zsh rejected ("no matches found"); one `gh run view` used an unsupported `actor` field. Each was rerun correctly once. (2) The usage allowance was not read at the start of the first (review) task; the first reading was taken when the follow-up task began. (3) The first report listed reused branch prefixes as a provenance problem; the owner had made prefixes deliberately non-agent-specific, so the finding was withdrawn.
- **Impact:** a few extra tool calls; the review task's start allowance is unavailable; one wrong finding reached the owner and was corrected the next turn. No repository or product effect.
- **Correction / remaining risk:** quote globs in zsh; read `get_usage` before any task's first tool call; check owner conventions before reporting process findings.
