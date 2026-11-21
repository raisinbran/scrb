### A-739 — 2026-11-17 — Codex / BCHEN-W10 — usage-tool discovery printed oversized descriptions

- **What failed:** I filtered tool metadata by broad description keywords and emitted a very large, truncated result while looking for the usage reader.
- **Impact:** Avoidable output and token use without additional task evidence.
- **Agent-controlled cause:** I printed full matching descriptions instead of selecting the exact usage tool name.
- **Correction / remaining risk:** Later calls selected `mcp__codex_app__get_usage_limits` directly. Low.
