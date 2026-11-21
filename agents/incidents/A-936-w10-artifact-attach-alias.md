### A-936 — 2026-11-20 — W10 — PR attachment used an unavailable dynamic-tool alias

- **Status / attribution:** Confirmed agent invocation error; no GitHub PR state changed.
- **What failed:** The first artifact-attachment call used the dynamic tool alias, which returned that attachment must use the Codex app MCP server.
- **Impact:** That call did not attach PR #392 to the task.
- **Correction / remaining risk:** Repeated the same attachment through the supported MCP server; PR #392 is now attached. Low.
