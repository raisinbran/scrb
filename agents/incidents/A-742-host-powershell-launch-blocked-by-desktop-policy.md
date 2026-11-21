### A-742 — 2026-11-17 — Codex / BCHEN-W10 — host PowerShell launch was blocked by desktop policy

- **What failed:** The computer-use tool rejected launching the explicit host PowerShell executable, so I could not resume the host-side app interaction through that route.
- **Impact:** The requested UI-initiated normal quit and final host launch were not verified in this session.
- **Agent-controlled cause:** I attempted the host-shell launch before confirming that this desktop surface permits launching PowerShell.
- **Correction / remaining risk:** I stopped the host UI attempt, retained the existing logs and did not substitute a managed-shell launch as host proof. The normal shutdown and current-source host startup remain unverified. High until a host-side verification is completed.
