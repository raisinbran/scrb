### A-734 — 2026-11-17 — Codex / BCHEN-W10 — user-input request used an unsupported field

- **What failed:** The first optional-approval request used a `question` property that the available tool schema does not accept; the request was rejected before it reached the owner.
- **Impact:** One unnecessary tool retry; no approval was inferred from the failed call.
- **Agent-controlled cause:** I did not check the tool's declared input shape before calling it.
- **Correction / remaining risk:** I resent the same concise question using the supported title/options fields. The owner explicitly approved the two notice calls. Low.
