### A-1098 — 2026-11-22 PT — cloud PR author — prohibited agent attribution in PR description

**Observed problem:** The original PR #454 description ended with an explicit authoring-agent designation (`Agent: ChatGPT cloud GitHub source investigator`). Repository `AGENTS.md` prohibits naming authoring or reviewing agents in PR text, separately from the strict prohibition on generated/co-authored attribution lines.

**Attribution:** Self-induced by the cloud PR author during initial PR publication, before this linked CI review. No generated/co-author trailers, secret or production data were added.

**Correction:** Updated PR #454 description to refer only to execution surfaces (cloud repository access, hosted Windows/macOS CI), without identifying an authoring or reviewing agent. No code changes, commit metadata changes, user-account changes or installer dispatch were involved.

**Prevention:** Treat PR body/comment as publication text; describe review independence and CI environment without naming the authoring/reviewing assistant. Preserve specific agent-and-computer task delegation in dedicated tracking instructions while respecting repository publication rules.

**Impact:** PR description-only correction, no observed installed-app or Windows workflow effect. Meter/time data are unavailable from the GitHub-connected cloud interface. Accounted in `agents/usage-log/2026-11-22-pr454-nsis-regex-lint-fix.md`.
